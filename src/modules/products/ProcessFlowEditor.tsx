import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { Tables } from '@/shared/types/database'

type NodeRow = Tables<'process_nodes'>
type EdgeRow = Tables<'process_edges'>

const ACT_W = 132
const ACT_H_BASE = 44

function newId(): string {
  return crypto.randomUUID()
}

export type ProcessFlowScope = { type: 'product'; id: string } | { type: 'template'; id: string }

export function ProcessFlowEditor({
  scope,
  editable,
  onChanged,
}: {
  scope: ProcessFlowScope
  editable: boolean
  onChanged?: () => void
}) {
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null)
  const connectRef = useRef<{ fromId: string; fromIsAction: boolean } | null>(null)
  const [connectLine, setConnectLine] = useState<{ fx: number; fy: number; tx: number; ty: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scopeCol = scope.type === 'product' ? 'product_id' : 'template_id'
  const scopeFields = { product_id: null as string | null, template_id: null as string | null, [scopeCol]: scope.id }
  const startCreatingRef = useRef(false)
  // Real DOM anchors for edge endpoints, keyed by edge/node id, instead of
  // approximating pixel offsets from row counts — the approximation drifted
  // from the actual flex-layout position and made lines land on the wrong row.
  const outputDotRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const tagPortRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  // the tag pill itself, always rendered even when the port dot isn't (view
  // mode) — used as a fallback anchor so lines never rely on the fixed-pixel
  // formula for a pill whose real width varies with its content
  const tagPillRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [, forceTick] = useState(0)

  useEffect(() => {
    startCreatingRef.current = false
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.id])

  // refs only get populated once the DOM commits; force one extra render
  // pass after nodes/edges (or the editable toggle, which changes which
  // anchor elements exist at all) change so edgeEndpoints can read fresh
  // positions instead of a stale ref from the previous DOM shape
  useLayoutEffect(() => {
    forceTick((t) => t + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, editable])

  const load = async () => {
    setLoading(true)
    const [{ data: nodeRows }, { data: edgeRows }] = await Promise.all([
      supabase.from('process_nodes').select('*').eq(scopeCol, scope.id),
      supabase.from('process_edges').select('*').eq(scopeCol, scope.id).order('sort_order'),
    ])
    let finalNodes = nodeRows ?? []
    // "開始" is a magic label the production-log validation trigger treats as
    // the unlimited source tag — every graph needs exactly one, so seed it
    // automatically rather than relying on the user typing it correctly.
    const hasStart = finalNodes.some((n) => n.kind === 'tag' && n.label === '開始')
    if (!hasStart && editable && !startCreatingRef.current) {
      startCreatingRef.current = true
      const { data: inserted } = await supabase
        .from('process_nodes')
        .insert({ id: newId(), kind: 'tag', label: '開始', pos_x: 40, pos_y: 180, ...scopeFields })
        .select()
        .single()
      if (inserted) finalNodes = [...finalNodes, inserted]
    }
    setNodes(finalNodes)
    setEdges(edgeRows ?? [])
    setLoading(false)
  }

  const findNode = (id: string) => nodes.find((n) => n.id === id)
  const isAction = (id: string) => findNode(id)?.kind === 'action'
  // sort locally (not just filter) so a reorder swap re-renders in its new
  // position immediately, instead of only after a reload re-fetches sorted
  const outEdgesOfAction = (id: string) => edges.filter((e) => e.from_node_id === id).sort((a, b) => a.sort_order - b.sort_order)
  const tagHasOutgoing = (id: string) => edges.some((e) => e.from_node_id === id)

  const actionHeight = (n: NodeRow) => {
    const outs = outEdgesOfAction(n.id).length
    return ACT_H_BASE + 28 + Math.max(outs, 1) * 24 + 4
  }

  const actionInPos = (n: NodeRow) => ({ x: n.pos_x, y: n.pos_y + 26 })
  const tagOutPortPos = (n: NodeRow) => ({ x: n.pos_x + 84, y: n.pos_y + 16 })
  const tagInPos = (n: NodeRow) => ({ x: n.pos_x, y: n.pos_y + 16 })

  // Measures an anchor element's actual on-canvas position rather than
  // guessing it from a row-index formula — accurate regardless of label
  // length, wrapping, or future layout tweaks.
  const measuredPos = (el: HTMLElement | undefined): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!el || !canvas) return null
    const er = el.getBoundingClientRect()
    const cr = canvas.getBoundingClientRect()
    return { x: er.left - cr.left + er.width / 2, y: er.top - cr.top + er.height / 2 }
  }

  // fallback anchor for a tag's outgoing edge when its connect-port isn't
  // rendered (view mode) — the pill itself is always present, so use its
  // real right edge rather than a fixed offset that assumed the port's width
  const measuredRightEdge = (el: HTMLElement | undefined): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!el || !canvas) return null
    const er = el.getBoundingClientRect()
    const cr = canvas.getBoundingClientRect()
    return { x: er.right - cr.left, y: er.top - cr.top + er.height / 2 }
  }

  const edgeEndpoints = (e: EdgeRow) => {
    const from = findNode(e.from_node_id)
    const to = findNode(e.to_node_id)
    if (!from || !to) return null
    if (from.kind === 'action') {
      const idx = outEdgesOfAction(from.id).findIndex((x) => x.id === e.id)
      const fallback = { x: from.pos_x + ACT_W, y: from.pos_y + ACT_H_BASE + 28 + idx * 24 + 12 }
      const p1 = measuredPos(outputDotRefs.current.get(e.id)) ?? fallback
      const p2 = tagInPos(to)
      return { fx: p1.x, fy: p1.y, tx: p2.x, ty: p2.y }
    }
    const p3 =
      measuredPos(tagPortRefs.current.get(from.id)) ??
      measuredRightEdge(tagPillRefs.current.get(from.id)) ??
      tagOutPortPos(from)
    const p4 = actionInPos(to)
    return { fx: p3.x, fy: p3.y, tx: p4.x, ty: p4.y }
  }

  const pathFor = (p: { fx: number; fy: number; tx: number; ty: number }) => {
    const midX = (p.fx + p.tx) / 2
    return `M ${p.fx} ${p.fy} C ${midX} ${p.fy}, ${midX} ${p.ty}, ${p.tx} ${p.ty}`
  }

  const persistPos = async (id: string, x: number, y: number) => {
    await supabase.from('process_nodes').update({ pos_x: x, pos_y: y }).eq('id', id)
  }

  const startDrag = (ev: React.PointerEvent, id: string) => {
    if (!editable) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const n = findNode(id)!
    dragRef.current = { id, offX: ev.clientX - rect.left - n.pos_x, offY: ev.clientY - rect.top - n.pos_y }
    ev.preventDefault()
  }

  const startConnect = (ev: React.PointerEvent, fromId: string, fromIsAction: boolean) => {
    if (!editable) return
    ev.stopPropagation()
    connectRef.current = { fromId, fromIsAction }
    const rect = canvasRef.current!.getBoundingClientRect()
    // anchor the drag line to the exact port the user grabbed, not an estimate
    const portRect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    const p = { x: portRect.left - rect.left + portRect.width / 2, y: portRect.top - rect.top + portRect.height / 2 }
    setConnectLine({ fx: p.x, fy: p.y, tx: ev.clientX - rect.left, ty: ev.clientY - rect.top })
    ev.preventDefault()
  }

  const onPointerMove = (ev: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    if (dragRef.current) {
      const x = Math.max(0, ev.clientX - rect.left - dragRef.current.offX)
      const y = Math.max(0, Math.min(rect.height - 30, ev.clientY - rect.top - dragRef.current.offY))
      setNodes((prev) => prev.map((n) => (n.id === dragRef.current!.id ? { ...n, pos_x: x, pos_y: y } : n)))
    } else if (connectRef.current) {
      setConnectLine((prev) => (prev ? { ...prev, tx: ev.clientX - rect.left, ty: ev.clientY - rect.top } : prev))
    }
  }

  const onPointerUp = async (ev: React.PointerEvent) => {
    if (dragRef.current) {
      const id = dragRef.current.id
      const n = findNode(id)
      dragRef.current = null
      if (n) await persistPos(id, n.pos_x, n.pos_y)
      return
    }
    if (connectRef.current) {
      const { fromId, fromIsAction } = connectRef.current
      connectRef.current = null
      const rect = canvasRef.current!.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      setConnectLine(null)

      if (fromIsAction) {
        const targetTag = nodes.find(
          (n) => n.kind === 'tag' && x >= n.pos_x - 10 && x <= n.pos_x + 110 && y >= n.pos_y - 10 && y <= n.pos_y + 30
        )
        if (targetTag) {
          const dup = edges.some((e) => e.from_node_id === fromId && e.to_node_id === targetTag.id)
          if (!dup) await addEdge(fromId, targetTag.id)
        } else {
          const overAction = nodes.find(
            (n) => n.kind === 'action' && x >= n.pos_x && x <= n.pos_x + ACT_W && y >= n.pos_y && y <= n.pos_y + actionHeight(n)
          )
          if (!overAction) {
            const tagId = newId()
            await addNode({ id: tagId, kind: 'tag', label: '新狀態', pos_x: x - 10, pos_y: y - 16 })
            await addEdge(fromId, tagId)
          }
        }
      } else {
        const targetAction = nodes.find(
          (n) => n.kind === 'action' && x >= n.pos_x && x <= n.pos_x + ACT_W && y >= n.pos_y && y <= n.pos_y + actionHeight(n)
        )
        if (targetAction) {
          const dup = edges.some((e) => e.from_node_id === fromId && e.to_node_id === targetAction.id)
          if (!dup) await addEdge(fromId, targetAction.id)
        } else {
          const overTag = nodes.some(
            (n) => n.kind === 'tag' && x >= n.pos_x - 10 && x <= n.pos_x + 110 && y >= n.pos_y - 10 && y <= n.pos_y + 30
          )
          if (!overTag) {
            const actId = newId()
            await addNode({ id: actId, kind: 'action', label: '新動作', pos_x: x - ACT_W / 2, pos_y: y - 20 })
            await addEdge(fromId, actId)
          }
        }
      }
    }
  }

  const addNode = async (n: { id: string; kind: 'action' | 'tag'; label: string; pos_x: number; pos_y: number }) => {
    setNodes((prev) => [...prev, { ...n, ...scopeFields, created_at: new Date().toISOString() }])
    await supabase.from('process_nodes').insert({ ...n, ...scopeFields })
  }

  const addEdge = async (fromNodeId: string, toNodeId: string) => {
    const id = newId()
    const siblingOrders = edges.filter((e) => e.from_node_id === fromNodeId).map((e) => e.sort_order)
    const sortOrder = siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 0
    setEdges((prev) => [
      ...prev,
      { id, ...scopeFields, from_node_id: fromNodeId, to_node_id: toNodeId, sort_order: sortOrder, created_at: new Date().toISOString() },
    ])
    await supabase.from('process_edges').insert({ id, ...scopeFields, from_node_id: fromNodeId, to_node_id: toNodeId, sort_order: sortOrder })
  }

  // swap this output edge with its neighbor above/below in the action's
  // output list — the only ordering signal is sort_order, so reordering is
  // just swapping two values, no need to touch anything else
  const moveOutput = async (actionId: string, edgeId: string, direction: -1 | 1) => {
    const outs = outEdgesOfAction(actionId)
    const idx = outs.findIndex((e) => e.id === edgeId)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= outs.length) return
    const a = outs[idx]
    const b = outs[swapIdx]
    setEdges((prev) =>
      prev.map((e) => (e.id === a.id ? { ...e, sort_order: b.sort_order } : e.id === b.id ? { ...e, sort_order: a.sort_order } : e))
    )
    await Promise.all([
      supabase.from('process_edges').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('process_edges').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
  }

  const removeNode = async (id: string) => {
    setError(null)
    // delete first: a node with production log history is protected by a
    // foreign key and must not disappear from the canvas if the delete fails
    const { error } = await supabase.from('process_nodes').delete().eq('id', id)
    if (error) {
      setError(
        error.message.includes('foreign key') ||
          error.message.includes('violates') ||
          error.message.includes('production log history')
          ? '這個節點已經有生產紀錄，無法刪除'
          : error.message
      )
      return
    }
    setNodes((prev) => prev.filter((n) => n.id !== id))
    setEdges((prev) => prev.filter((e) => e.from_node_id !== id && e.to_node_id !== id))
  }

  const removeEdge = async (id: string) => {
    setError(null)
    const { error } = await supabase.from('process_edges').delete().eq('id', id)
    if (error) {
      setError(
        error.message.includes('production log history') ? '這條連線已經有生產紀錄，無法刪除' : error.message
      )
      return
    }
    setEdges((prev) => prev.filter((e) => e.id !== id))
  }

  const renameNode = async (id: string, label: string) => {
    const clean = label.trim() || '未命名'
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, label: clean } : n)))
    await supabase.from('process_nodes').update({ label: clean }).eq('id', id)
  }

  const addAction = () => {
    addNode({ id: newId(), kind: 'action', label: '新動作', pos_x: 40, pos_y: 40 })
  }
  const addTag = () => {
    addNode({ id: newId(), kind: 'tag', label: '新狀態', pos_x: 40, pos_y: 400 })
  }

  const clearCanvas = async () => {
    setError(null)
    if (scope.type === 'product') {
      const [{ count: logCount }, { count: adjustmentCount }] = await Promise.all([
        supabase.from('production_logs').select('id', { count: 'exact', head: true }).eq('product_id', scope.id),
        supabase.from('stock_adjustments').select('id', { count: 'exact', head: true }).eq('product_id', scope.id),
      ])
      if ((logCount ?? 0) > 0) {
        window.alert('這個產品已經有生產紀錄，無法清空流程。')
        return
      }
      if ((adjustmentCount ?? 0) > 0) {
        window.alert('這個產品還有校正紀錄，無法清空流程。')
        return
      }
    }
    if (!window.confirm('確定要清空畫布嗎？除了「開始」以外的節點都會被刪除，此動作無法復原。')) return
    const startNode = nodes.find((n) => n.kind === 'tag' && n.label === '開始')
    const idsToDelete = nodes.filter((n) => n.id !== startNode?.id).map((n) => n.id)
    if (idsToDelete.length > 0) {
      const { error } = await supabase.from('process_nodes').delete().in('id', idsToDelete)
      if (error) {
        setError(
          error.message.includes('foreign key') ||
            error.message.includes('violates') ||
            error.message.includes('production log history')
            ? '清空失敗：這個流程裡有節點已經有生產紀錄，無法清空'
            : '清空失敗：' + error.message
        )
        return
      }
    }
    if (scope.type === 'product') {
      // the graph no longer matches whatever templates were applied before —
      // clear that history so it doesn't claim a stale provenance
      await supabase.from('product_template_applications').delete().eq('product_id', scope.id)
    }
    setNodes((prev) => prev.filter((n) => n.id === startNode?.id))
    setEdges([])
    onChanged?.()
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  const actionNodes = nodes.filter((n) => n.kind === 'action')
  const tagNodes = nodes.filter((n) => n.kind === 'tag')

  return (
    <div>
      {editable && (
        <div className="flex gap-2 mb-2">
          <button onClick={addAction} className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50">
            ＋ 新增動作站
          </button>
          <button onClick={addTag} className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50">
            ＋ 新增標籤
          </button>
          <button onClick={clearCanvas} className="border rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
            清空畫布
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      <div className="border rounded-lg overflow-auto" style={{ height: 500 }}>
        <div
          ref={canvasRef}
          className="relative"
          style={{
            width: 2150,
            height: 560,
            backgroundColor: '#FBFAF6',
            backgroundImage: 'radial-gradient(#E7E2D3 1px, transparent 1px)',
            backgroundSize: '22px 22px',
            touchAction: 'none',
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <svg className="absolute inset-0 pointer-events-none" width={2150} height={560}>
            <defs>
              <marker id="pfe-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#3C6E62" />
              </marker>
              <marker id="pfe-arr-term" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#B0532E" />
              </marker>
            </defs>
            {edges.map((e) => {
              const p = edgeEndpoints(e)
              if (!p) return null
              const terminal = isAction(e.from_node_id) && !tagHasOutgoing(e.to_node_id)
              return (
                <g key={e.id}>
                  <path
                    d={pathFor(p)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ pointerEvents: editable ? 'stroke' : 'none', cursor: 'pointer' }}
                    onClick={() => editable && removeEdge(e.id)}
                  />
                  <path
                    d={pathFor(p)}
                    fill="none"
                    stroke={terminal ? '#B0532E' : '#3C6E62'}
                    strokeWidth={2}
                    strokeDasharray={terminal ? '4 3' : undefined}
                    markerEnd={terminal ? 'url(#pfe-arr-term)' : 'url(#pfe-arr)'}
                  />
                </g>
              )
            })}
            {connectLine && (
              <path d={pathFor(connectLine)} fill="none" stroke="#A79E8B" strokeWidth={2} strokeDasharray="3 3" />
            )}
          </svg>

          {actionNodes.map((n) => {
            const outs = outEdgesOfAction(n.id)
            return (
              <div
                key={n.id}
                className="absolute bg-white border rounded-lg px-2.5 pt-2 pb-2"
                style={{ left: n.pos_x, top: n.pos_y, width: ACT_W, borderColor: '#C2BAA2', cursor: editable ? 'grab' : 'default' }}
                onPointerDown={(ev) => {
                  if ((ev.target as HTMLElement).closest('.pfe-port,button,[contenteditable]')) return
                  startDrag(ev, n.id)
                }}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div
                    contentEditable={editable}
                    suppressContentEditableWarning
                    onBlur={(ev) => renameNode(n.id, ev.currentTarget.innerText)}
                    className="text-[13px] font-medium leading-snug outline-none flex-1"
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                  >
                    {n.label}
                  </div>
                  {editable && (
                    <button onClick={() => removeNode(n.id)} className="text-xs text-gray-400 hover:text-red-600">
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1 mt-1.5">
                  {outs.map((e, idx) => {
                    const t = findNode(e.to_node_id)
                    return (
                      <div key={e.id} className="flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded px-1.5 py-0.5 text-[11px]">
                        <span className="flex-1 truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                          {t?.label ?? '?'}
                        </span>
                        {editable && outs.length > 1 && (
                          <span className="flex flex-col leading-none flex-shrink-0">
                            <button
                              onClick={() => moveOutput(n.id, e.id, -1)}
                              disabled={idx === 0}
                              className="text-amber-700 disabled:opacity-20 hover:opacity-100 leading-none"
                              style={{ fontSize: 9 }}
                              title="往上移"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => moveOutput(n.id, e.id, 1)}
                              disabled={idx === outs.length - 1}
                              className="text-amber-700 disabled:opacity-20 hover:opacity-100 leading-none"
                              style={{ fontSize: 9 }}
                              title="往下移"
                            >
                              ▼
                            </button>
                          </span>
                        )}
                        {editable && (
                          <button onClick={() => removeEdge(e.id)} className="text-amber-700 opacity-60 hover:opacity-100">
                            ✕
                          </button>
                        )}
                        <span
                          ref={(el) => {
                            if (el) outputDotRefs.current.set(e.id, el)
                            else outputDotRefs.current.delete(e.id)
                          }}
                          className="w-1.5 h-1.5 rounded-full bg-amber-700 flex-shrink-0"
                          style={{ position: 'relative', right: -19.7 }}
                        />
                      </div>
                    )
                  })}
                </div>
                {editable && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[10.5px] text-amber-700 flex-1" style={{ fontFamily: 'ui-monospace, monospace' }}>
                      ＋ 輸出狀態
                    </span>
                    <span
                      className="pfe-port w-3 h-3 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: '#A9791E', background: '#F1E6C9', cursor: 'crosshair', position: 'relative', right: -16.7 }}
                      onPointerDown={(ev) => startConnect(ev, n.id, true)}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {tagNodes.map((n) => {
            const terminal = !tagHasOutgoing(n.id)
            const isStart = n.label === '開始'
            return (
              <div
                key={n.id}
                ref={(el) => {
                  if (el) tagPillRefs.current.set(n.id, el)
                  else tagPillRefs.current.delete(n.id)
                }}
                className="absolute rounded-full border-[1.5px] px-2.5 py-1.5 flex items-center gap-1.5"
                style={{
                  left: n.pos_x,
                  top: n.pos_y,
                  borderColor: isStart ? '#3C6E62' : terminal ? '#B0532E' : '#A9791E',
                  background: isStart ? '#E3EDE8' : terminal ? '#F4E4DC' : '#F1E6C9',
                  cursor: editable ? 'grab' : 'default',
                }}
                onPointerDown={(ev) => {
                  if ((ev.target as HTMLElement).closest('.pfe-port,button,[contenteditable]')) return
                  startDrag(ev, n.id)
                }}
              >
                <div
                  contentEditable={editable && !isStart}
                  suppressContentEditableWarning
                  onBlur={(ev) => renameNode(n.id, ev.currentTarget.innerText)}
                  className="text-xs outline-none whitespace-nowrap"
                  style={{ color: isStart ? '#3C6E62' : terminal ? '#B0532E' : '#A9791E', fontFamily: 'ui-monospace, monospace' }}
                >
                  {n.label}
                </div>
                {editable && (
                  <>
                    <span
                      ref={(el) => {
                        if (el) tagPortRefs.current.set(n.id, el)
                        else tagPortRefs.current.delete(n.id)
                      }}
                      className="pfe-port w-2.5 h-2.5 rounded-full border-2 flex-shrink-0"
                      style={{ borderColor: '#3C6E62', background: '#E3EDE8', cursor: 'crosshair' }}
                      onPointerDown={(ev) => startConnect(ev, n.id, false)}
                    />
                    {isStart ? (
                      <span className="text-xs opacity-55" style={{ color: '#3C6E62' }} title="固定起點，無法刪除">
                        🔒
                      </span>
                    ) : (
                      <button
                        onClick={() => removeNode(n.id)}
                        className="text-xs opacity-55 hover:opacity-100"
                        style={{ color: terminal ? '#B0532E' : '#A9791E' }}
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
