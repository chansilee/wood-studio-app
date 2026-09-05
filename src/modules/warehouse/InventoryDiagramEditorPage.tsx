import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Tables } from '@/shared/types/database'

type Diagram = Tables<'inventory_diagrams'>
type Layer = Tables<'inventory_diagram_layers'>
type NodeRow = Tables<'inventory_diagram_nodes'>
type EdgeRow = Tables<'inventory_diagram_edges'>
type PathRow = Tables<'inventory_diagram_paths'>
type PathSetting = Tables<'product_inventory_path_settings'>
type LayerSync = Tables<'product_tag_layer_sync'>

const LOCK_EXPIRY_MINUTES = 15
const FETCH_PAGE_SIZE = 1000

// PostgREST單次查詢預設最多只回1000筆、超過會被靜默截斷（不會報錯）。
// product_inventory_path_settings現在光是一個diagram底下就已經破千筆，
// 用.in('path_id', ...)精準過濾還是不夠，要用.range()分頁把全部抓完，
// 不然使用者剛寫入啟用的資料可能剛好落在被砍掉的那一段，畫面顯示跟
// 資料庫對不起來
async function fetchAllPages<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await query(from, from + FETCH_PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < FETCH_PAGE_SIZE) break
    from += FETCH_PAGE_SIZE
  }
  return all
}

export function InventoryDiagramEditorPage({ diagramId, onBack }: { diagramId: string; onBack: () => void }) {
  const { profile } = useAuth()
  const [diagram, setDiagram] = useState<Diagram | null>(null)
  const [layers, setLayers] = useState<Layer[]>([])
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [paths, setPaths] = useState<PathRow[]>([])
  const [pathSettings, setPathSettings] = useState<PathSetting[]>([])
  const [layerSync, setLayerSync] = useState<LayerSync[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lockedByOtherName, setLockedByOtherName] = useState<string | null>(null)

  const readOnly = !!lockedByOtherName

  // refetch without toggling `loading` — used after every edit action so the
  // whole tree doesn't unmount (which would lose Canvas drag state and, worse,
  // reset MatchToProduct's in-progress scan/selected-product back to closed on
  // every single 啟用/預設 checkbox click). `loading` only gates the very
  // first mount / an actual diagram switch, via load() below.
  const fetchAndApply = async () => {
    const [{ data: d }, { data: l }, { data: n }, { data: e }, { data: p }] = await Promise.all([
      supabase.from('inventory_diagrams').select('*').eq('id', diagramId).single(),
      supabase.from('inventory_diagram_layers').select('*').eq('diagram_id', diagramId).order('depth'),
      supabase
        .from('inventory_diagram_nodes')
        .select('*, inventory_diagram_layers!inner(diagram_id)')
        .eq('inventory_diagram_layers.diagram_id', diagramId)
        .order('created_at'),
      supabase.from('inventory_diagram_edges').select('*').eq('diagram_id', diagramId),
      supabase.from('inventory_diagram_paths').select('*').eq('diagram_id', diagramId),
    ])
    setDiagram(d ?? null)
    setLayers(l ?? [])
    setNodes((n as NodeRow[] | null) ?? [])
    setEdges(e ?? [])
    setPaths(p ?? [])

    // product_inventory_path_settings 光是這一個diagram底下就已經破千筆
    // （查過超過1000筆），單次.select()一定會被PostgREST的1000筆上限
    // 靜默截斷——寫入永遠成功，但畫面抓回來的資料被砍過，症狀就是「明明
    // 啟用了，品項清單卻沒打勾／原本編輯好的突然變空白」。改成.range()
    // 分頁抓完全部，並且先用這個diagram自己的path_id/layer_id過濾，兩層
    // 保護都要有
    const pathIds = (p ?? []).map((r) => r.id)
    const layerIds = (l ?? []).map((r) => r.id)
    try {
      const [s, sync] = await Promise.all([
        pathIds.length > 0
          ? fetchAllPages<PathSetting>((from, to) =>
              supabase.from('product_inventory_path_settings').select('*').in('path_id', pathIds).order('id').range(from, to)
            )
          : Promise.resolve([]),
        layerIds.length > 0
          ? fetchAllPages<LayerSync>((from, to) =>
              supabase
                .from('product_tag_layer_sync')
                .select('*')
                .in('layer_id', layerIds)
                .order('product_tag_node_id')
                .range(from, to)
            )
          : Promise.resolve([]),
      ])
      setPathSettings(s)
      setLayerSync(sync)
      setError(null)
    } catch (e) {
      setError(`載入啟用設定失敗：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const load = async () => {
    setLoading(true)
    await fetchAndApply()
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId])

  // ---- concurrency lock ----
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    const checkAndAcquire = async () => {
      const { data } = await supabase.from('inventory_diagrams').select('locked_by, locked_at').eq('id', diagramId).single()
      if (cancelled || !data) return
      const expired = !data.locked_at || Date.now() - new Date(data.locked_at).getTime() > LOCK_EXPIRY_MINUTES * 60 * 1000
      if (data.locked_by && data.locked_by !== profile.id && !expired) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name, preferred_display_name')
          .eq('id', data.locked_by)
          .maybeSingle()
        setLockedByOtherName(prof ? prof.preferred_display_name || prof.display_name : '其他人')
        return
      }
      await supabase
        .from('inventory_diagrams')
        .update({ locked_by: profile.id, locked_at: new Date().toISOString() })
        .eq('id', diagramId)
      setLockedByOtherName(null)
    }
    checkAndAcquire()
    const touch = setInterval(() => {
      if (!lockedByOtherName) {
        supabase.from('inventory_diagrams').update({ locked_at: new Date().toISOString() }).eq('id', diagramId)
      }
    }, 60000)
    return () => {
      cancelled = true
      clearInterval(touch)
      if (profile) {
        supabase
          .from('inventory_diagrams')
          .update({ locked_by: null, locked_at: null })
          .eq('id', diagramId)
          .eq('locked_by', profile.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId, profile?.id])

  const maxDepth = layers.reduce((m, l) => Math.max(m, l.depth), 0)
  const nodesByLayer = (layerId: string) => nodes.filter((n) => n.layer_id === layerId)
  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label ?? '?'

  const lockedPathSet = new Set(pathSettings.map((s) => s.path_id))
  const lockedPaths = paths.filter((p) => lockedPathSet.has(p.id))
  const isNodeLocked = (nodeId: string) => lockedPaths.some((p) => p.node_ids.includes(nodeId))
  const isEdgeLocked = (fromId: string, toId: string) =>
    lockedPaths.some((p) => {
      const idx = p.node_ids.indexOf(fromId)
      return idx !== -1 && p.node_ids[idx + 1] === toId
    })

  const reportError = (e: { message: string } | null) => {
    if (e) setError(e.message)
    else setError(null)
  }

  // ---- layer / node / edge mutations ----
  const addLayer = async () => {
    const name = window.prompt('新增一層，這層要叫什麼名字？（例如：眉型）')
    if (!name || !name.trim()) return
    const { error } = await supabase
      .from('inventory_diagram_layers')
      .insert({ diagram_id: diagramId, name: name.trim(), depth: maxDepth + 1 })
    reportError(error)
    if (!error) fetchAndApply()
  }

  const renameLayer = async (layerId: string, name: string) => {
    if (!name.trim()) return
    const { error } = await supabase.from('inventory_diagram_layers').update({ name: name.trim() }).eq('id', layerId)
    reportError(error)
    if (!error) fetchAndApply()
  }

  const deleteLayer = async (layerId: string) => {
    if (!window.confirm('確定要刪除這一層嗎？')) return
    const { error } = await supabase.rpc('delete_inventory_diagram_layer', { p_layer_id: layerId })
    reportError(error)
    if (!error) fetchAndApply()
  }

  const addNode = async (layerId: string) => {
    const label = window.prompt('新增一個選項，名字是？')
    if (!label || !label.trim()) return
    const { error } = await supabase.from('inventory_diagram_nodes').insert({ layer_id: layerId, label: label.trim() })
    reportError(error)
    if (!error) {
      await supabase.rpc('recompute_diagram_paths', { p_diagram_id: diagramId })
      fetchAndApply()
    }
  }

  const renameNode = async (nodeId: string, label: string) => {
    if (!label.trim()) return
    const { error } = await supabase.from('inventory_diagram_nodes').update({ label: label.trim() }).eq('id', nodeId)
    reportError(error)
    if (!error) fetchAndApply()
  }

  const deleteNode = async (nodeId: string) => {
    const { error } = await supabase.rpc('delete_inventory_diagram_node', { p_node_id: nodeId })
    reportError(error)
    if (!error) fetchAndApply()
  }

  const toggleEdge = async (fromId: string, toId: string) => {
    if (isEdgeLocked(fromId, toId)) return // 紅色鎖定連線，點了沒動作
    const existing = edges.find((e) => e.from_node_id === fromId && e.to_node_id === toId)
    const { error } = existing
      ? await supabase.rpc('delete_inventory_diagram_edge', { p_edge_id: existing.id })
      : await supabase.rpc('add_inventory_diagram_edge', { p_diagram_id: diagramId, p_from_node_id: fromId, p_to_node_id: toId })
    reportError(error)
    if (!error) fetchAndApply()
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>
  if (!diagram) return <div className="text-sm text-red-600">找不到這個入庫分類</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="text-xs text-blue-700 underline">
          ← 返回列表
        </button>
        <h2 className="text-lg font-semibold">{diagram.name}</h2>
        <div />
      </div>

      {lockedByOtherName && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
          {lockedByOtherName} 正在編輯這個入庫分類，你目前是唯讀模式。
        </p>
      )}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <Canvas
        layers={layers}
        nodesByLayer={nodesByLayer}
        edges={edges}
        isNodeLocked={isNodeLocked}
        isEdgeLocked={isEdgeLocked}
        readOnly={readOnly}
        onAddLayer={addLayer}
        onRenameLayer={renameLayer}
        onDeleteLayer={deleteLayer}
        onAddNode={addNode}
        onRenameNode={renameNode}
        onDeleteNode={deleteNode}
        onToggleEdge={toggleEdge}
      />

      <PathPreview paths={paths} nodeLabel={nodeLabel} lockedPathSet={lockedPathSet} />

      <MatchToProduct
        layer1Nodes={nodes.filter((n) => n.layer_id === layers.find((l) => l.depth === 1)?.id)}
        layers={layers}
        nodes={nodes}
        edges={edges}
        paths={paths}
        pathSettings={pathSettings}
        layerSync={layerSync}
        nodeLabel={nodeLabel}
        readOnly={readOnly}
        onChanged={fetchAndApply}
      />
    </div>
  )
}

// ============================================================
// Canvas: variable-depth layered connection graph
// ============================================================
function Canvas({
  layers,
  nodesByLayer,
  edges,
  isNodeLocked,
  isEdgeLocked,
  readOnly,
  onAddLayer,
  onRenameLayer,
  onDeleteLayer,
  onAddNode,
  onRenameNode,
  onDeleteNode,
  onToggleEdge,
}: {
  layers: Layer[]
  nodesByLayer: (layerId: string) => NodeRow[]
  edges: EdgeRow[]
  isNodeLocked: (id: string) => boolean
  isEdgeLocked: (from: string, to: string) => boolean
  readOnly: boolean
  onAddLayer: () => void
  onRenameLayer: (layerId: string, name: string) => void
  onDeleteLayer: (layerId: string) => void
  onAddNode: (layerId: string) => void
  onRenameNode: (nodeId: string, label: string) => void
  onDeleteNode: (nodeId: string) => void
  onToggleEdge: (from: string, to: string) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<{ fromId: string; fromLayerDepth: number; x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [, forceRerender] = useState(0)
  const maxDepth = layers.reduce((m, l) => Math.max(m, l.depth), 0)

  // node pills measure themselves via the DOM (getBoundingClientRect), which
  // is only accurate once painted — re-render once after mount/resize/data
  // changes so the SVG lines snap to the real positions instead of (0,0)
  useEffect(() => {
    const bump = () => forceRerender((x) => x + 1)
    const raf = requestAnimationFrame(bump)
    window.addEventListener('resize', bump)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', bump)
    }
  }, [layers, nodesByLayer, edges])

  const centerOf = (nodeId: string) => {
    const el = document.getElementById(`inv-node-${nodeId}`)
    const board = boardRef.current
    if (!el || !board) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const b = board.getBoundingClientRect()
    return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top }
  }

  const onPointerDown = (e: React.PointerEvent, nodeId: string, depth: number) => {
    if (readOnly || depth === maxDepth) return
    const p = centerOf(nodeId)
    setDragging({ fromId: nodeId, fromLayerDepth: depth, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !boardRef.current) return
    const b = boardRef.current.getBoundingClientRect()
    setDragging({ ...dragging, x2: e.clientX - b.left, y2: e.clientY - b.top })
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return
    const under = document.elementFromPoint(e.clientX, e.clientY)
    const targetEl = under?.closest('[data-node-id]') as HTMLElement | null
    if (targetEl) {
      const targetId = targetEl.dataset.nodeId!
      const targetDepth = Number(targetEl.dataset.depth)
      if (targetDepth === dragging.fromLayerDepth + 1) {
        onToggleEdge(dragging.fromId, targetId)
      }
    }
    setDragging(null)
  }

  return (
    <div className="border rounded-lg bg-white p-4 mb-4">
      <div
        ref={boardRef}
        className="relative flex gap-6 overflow-x-auto pb-2"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {edges.map((edge) => {
            const p1 = centerOf(edge.from_node_id)
            const p2 = centerOf(edge.to_node_id)
            const locked = isEdgeLocked(edge.from_node_id, edge.to_node_id)
            const mx = (p1.x + p2.x) / 2
            return (
              <path
                key={edge.id}
                d={`M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`}
                stroke={locked ? '#dc2626' : '#9ca3af'}
                strokeWidth={locked ? 2.2 : 1.6}
                fill="none"
                className="pointer-events-auto cursor-pointer"
                onClick={() => onToggleEdge(edge.from_node_id, edge.to_node_id)}
              />
            )
          })}
          {dragging && (
            <path
              d={`M ${dragging.x1} ${dragging.y1} C ${(dragging.x1 + dragging.x2) / 2} ${dragging.y1}, ${(dragging.x1 + dragging.x2) / 2} ${dragging.y2}, ${dragging.x2} ${dragging.y2}`}
              stroke="#d98a3d"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="none"
            />
          )}
        </svg>

        {layers.map((layer) => (
          <div key={layer.id} className="relative z-10 flex flex-col items-center gap-3 min-w-[140px]">
            <LayerHeader
              layer={layer}
              isLast={layer.depth === maxDepth}
              readOnly={readOnly}
              onRename={(name) => onRenameLayer(layer.id, name)}
              onDelete={() => onDeleteLayer(layer.id)}
            />
            {nodesByLayer(layer.id).map((n) => (
              <NodePill
                key={n.id}
                node={n}
                depth={layer.depth}
                locked={isNodeLocked(n.id)}
                readOnly={readOnly}
                onPointerDown={(e) => onPointerDown(e, n.id, layer.depth)}
                onRename={(label) => onRenameNode(n.id, label)}
                onDelete={() => onDeleteNode(n.id)}
                onForceRerender={() => forceRerender((x) => x + 1)}
              />
            ))}
            {!readOnly && (
              <button
                onClick={() => onAddNode(layer.id)}
                className="text-xs text-blue-700 border border-dashed border-blue-300 rounded-full px-3 py-1 hover:bg-blue-50"
              >
                + 新增節點
              </button>
            )}
          </div>
        ))}

        {!readOnly && (
          <div className="flex flex-col items-center justify-start pt-8">
            <button
              onClick={onAddLayer}
              className="text-sm text-gray-600 border border-dashed border-gray-300 rounded-lg px-4 py-6 hover:bg-gray-50"
            >
              + 新增一層
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        從節點按住拖到下一欄的節點放開＝接線／斷線。紅色連線代表已經有品項在用，點了沒有動作。
      </p>
    </div>
  )
}

function LayerHeader({
  layer,
  isLast,
  readOnly,
  onRename,
  onDelete,
}: {
  layer: Layer
  isLast: boolean
  readOnly: boolean
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(layer.name)
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onRename(value)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="text-xs font-bold text-center border rounded px-1 py-0.5 w-24"
      />
    )
  }
  return (
    <div className="flex items-center gap-1">
      <button
        disabled={readOnly}
        onClick={() => setEditing(true)}
        className="text-xs font-bold uppercase tracking-wide text-gray-600"
      >
        {layer.name}
      </button>
      {!readOnly && isLast && (
        <button onClick={onDelete} className="text-gray-300 hover:text-red-600 text-xs" title="刪除這一層">
          ×
        </button>
      )}
    </div>
  )
}

function NodePill({
  node,
  depth,
  locked,
  readOnly,
  onPointerDown,
  onRename,
  onDelete,
  onForceRerender,
}: {
  node: NodeRow
  depth: number
  locked: boolean
  readOnly: boolean
  onPointerDown: (e: React.PointerEvent) => void
  onRename: (label: string) => void
  onDelete: () => void
  onForceRerender: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(node.label)

  useEffect(() => {
    onForceRerender()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          setEditing(false)
          onRename(value)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="text-sm border rounded-full px-3 py-1.5 w-28 text-center"
      />
    )
  }

  return (
    <div
      id={`inv-node-${node.id}`}
      data-node-id={node.id}
      data-depth={depth}
      onPointerDown={onPointerDown}
      className={`group relative text-sm font-medium rounded-full px-4 py-1.5 border cursor-grab select-none ${
        locked ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300 bg-gray-50 text-gray-800'
      }`}
    >
      <span onDoubleClick={() => !readOnly && !locked && setEditing(true)}>{node.label}</span>
      {!readOnly && !locked && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 absolute -right-1.5 -top-1.5 bg-white border rounded-full w-4 h-4 text-[10px] leading-none text-gray-400 hover:text-red-600"
          title="刪除節點"
        >
          ×
        </button>
      )}
    </div>
  )
}

// ============================================================
// live path preview
// ============================================================
function PathPreview({
  paths,
  nodeLabel,
  lockedPathSet,
}: {
  paths: PathRow[]
  nodeLabel: (id: string) => string
  lockedPathSet: Set<string>
}) {
  const [expanded, setExpanded] = useState(false)
  const grouped: Record<string, PathRow[]> = {}
  for (const p of paths) {
    const first = p.node_ids[0]
    ;(grouped[nodeLabel(first)] ??= []).push(p)
  }
  return (
    <div className="border rounded-lg bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">即時總品項預覽</h3>
          <button onClick={() => setExpanded((x) => !x)} className="text-xs text-blue-700 hover:underline">
            {expanded ? '[-收合]' : '[+展開]'}
          </button>
        </div>
        <span className="text-xs font-mono bg-black text-white rounded-full px-2.5 py-0.5">{paths.length} 種</span>
      </div>
      {!expanded ? null : paths.length === 0 ? (
        <p className="text-xs text-gray-400">還沒有完整路徑——拉出連線之後這裡會列出來。</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(grouped).map(([first, rows]) => (
            <div key={first} className="border-l-2 border-gray-200 pl-3">
              <h4 className="text-xs font-bold mb-1.5">
                {first} <span className="text-gray-400 font-mono">({rows.length})</span>
              </h4>
              <ul className="space-y-1">
                {rows.map((p) => (
                  <li key={p.id} className={`text-xs flex items-center gap-1.5 ${lockedPathSet.has(p.id) ? 'text-red-600' : 'text-gray-600'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${lockedPathSet.has(p.id) ? 'bg-red-500' : 'bg-gray-300'}`} />
                    {p.node_ids.map(nodeLabel).join('・')}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Match to Product
// ============================================================
type RealTag = { id: string; label: string; product_id: string; product_name: string }
type TagMatch = { tag: RealTag; matchedNodeId: string | null; matchedNodeLabel: string | null }
type ProductMatch = { product_id: string; product_name: string; tags: TagMatch[] }

function MatchToProduct({
  layer1Nodes,
  layers,
  nodes,
  edges,
  paths,
  pathSettings,
  layerSync,
  nodeLabel,
  readOnly,
  onChanged,
}: {
  layer1Nodes: NodeRow[]
  layers: Layer[]
  nodes: NodeRow[]
  edges: EdgeRow[]
  paths: PathRow[]
  pathSettings: PathSetting[]
  layerSync: LayerSync[]
  nodeLabel: (id: string) => string
  readOnly: boolean
  onChanged: () => void
}) {
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [successMatches, setSuccessMatches] = useState<ProductMatch[] | null>(null)
  const [warningMatches, setWarningMatches] = useState<ProductMatch[] | null>(null)
  const [openList, setOpenList] = useState<'success' | 'warning' | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<ProductMatch | null>(null)
  const [sourceProductId, setSourceProductId] = useState<string | null>(null)
  const [targetProductIds, setTargetProductIds] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ success: number; failed: number } | null>(null)
  const [defaultRemovalIds, setDefaultRemovalIds] = useState<Set<string>>(new Set())
  const [removingDefaults, setRemovingDefaults] = useState(false)
  const [removeDefaultResult, setRemoveDefaultResult] = useState<string | null>(null)
  const [removingEnabled, setRemovingEnabled] = useState(false)
  const [removeEnabledResult, setRemoveEnabledResult] = useState<string | null>(null)

  const scan = async () => {
    setScanning(true)
    setScanError(null)
    // process_nodes 也包含「範本」自己的節點（product_id 是 null，掛在
    // template_id 底下），那些不是真實產品、不會有庫存；label 也只要真正的
    // 「成品」tag（例如「赤柴(成品)」），排除「半成品」跟其他中間狀態的tag
    const { data, error } = await supabase
      .from('process_nodes')
      .select('id, label, product_id, products(name)')
      .eq('kind', 'tag')
      .not('product_id', 'is', null)
      .like('label', '%(成品)%')
    if (error) {
      setScanning(false)
      setScanError(`掃描失敗：${error.message}`)
      setSuccessMatches(null)
      setWarningMatches(null)
      return
    }
    const rows = ((data ?? []) as unknown as { id: string; label: string; product_id: string; products: { name: string } | null }[]).map(
      (r) => ({ id: r.id, label: r.label, product_id: r.product_id, product_name: r.products?.name ?? '未知產品' })
    )

    const norm = (s: string) => s.trim().toLowerCase()
    const matchOne = (tag: RealTag): TagMatch => {
      const exact = layer1Nodes.find((n) => n.label === tag.label)
      if (exact) return { tag, matchedNodeId: exact.id, matchedNodeLabel: exact.label }
      const fuzzy = layer1Nodes.find((n) => norm(n.label) === norm(tag.label))
      return { tag, matchedNodeId: fuzzy?.id ?? null, matchedNodeLabel: fuzzy?.label ?? null }
    }

    // 以「產品」為單位算match，不是每個tag各自算一筆：一個產品自己有幾個
    // 成品tag（例如坐柴有赤/黑/白/奶油柴(成品)四個），要全部都精確對上，
    // 這個產品才算一個successful match；少對上任何一個，整個產品算warning
    const byProduct = new Map<string, ProductMatch>()
    for (const tag of rows) {
      const entry = byProduct.get(tag.product_id) ?? { product_id: tag.product_id, product_name: tag.product_name, tags: [] }
      entry.tags.push(matchOne(tag))
      byProduct.set(tag.product_id, entry)
    }
    // 每個產品底下的tag，照這個diagram第一層節點本來的順序排（由上而下），
    // layer1Nodes 已經照建立時間排好了；完全沒對到節點的排到最後
    const layer1Order = new Map(layer1Nodes.map((n, i) => [n.id, i]))
    const products = Array.from(byProduct.values())
    for (const p of products) {
      p.tags.sort((a, b) => {
        const ra = a.matchedNodeId ? layer1Order.get(a.matchedNodeId) ?? Infinity : Infinity
        const rb = b.matchedNodeId ? layer1Order.get(b.matchedNodeId) ?? Infinity : Infinity
        return ra - rb
      })
    }
    setSuccessMatches(products.filter((p) => p.tags.every((t) => t.matchedNodeId && t.matchedNodeLabel === t.tag.label)))
    setWarningMatches(products.filter((p) => !p.tags.every((t) => t.matchedNodeId && t.matchedNodeLabel === t.tag.label)))
    setScanning(false)
    setOpenList(null)
    setSelectedProduct(null)
    setSourceProductId(null)
    setTargetProductIds(new Set())
    setApplyResult(null)
    setDefaultRemovalIds(new Set())
    setRemoveDefaultResult(null)
    setRemoveEnabledResult(null)
  }

  const toggleDefaultRemoval = (productId: string) => {
    setDefaultRemovalIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
    setRemoveDefaultResult(null)
    setRemoveEnabledResult(null)
  }

  const removeDefaults = async () => {
    if (defaultRemovalIds.size === 0) return
    const products = (successMatches ?? []).filter((p) => defaultRemovalIds.has(p.product_id))
    const tagIds = products.flatMap((p) => p.tags.map((t) => t.tag.id))
    const ids = pathSettings.filter((s) => s.is_default && tagIds.includes(s.product_tag_node_id)).map((s) => s.id)
    setRemovingDefaults(true)
    if (ids.length > 0) {
      const { error } = await supabase.from('product_inventory_path_settings').update({ is_default: false }).in('id', ids)
      if (error) {
        setRemovingDefaults(false)
        window.alert(`移除失敗：${error.message}`)
        return
      }
    }
    setRemovingDefaults(false)
    setRemoveDefaultResult(ids.length > 0 ? `已移除 ${ids.length} 筆成品預設分類` : '所選產品目前都沒有設定預設分類')
    setDefaultRemovalIds(new Set())
    onChanged()
  }

  // 連啟用一起移除＝直接把這些tag底下所有設定row整筆刪掉（跟單一路徑
  // 取消啟用同一個道理：刪掉row本身，recompute_diagram_paths()的「還有沒
  // 有被引用」檢查才會真的解鎖，畫布上才能繼續延展/刪除這些節點）
  const removeEnabledAndDefaults = async () => {
    if (defaultRemovalIds.size === 0) return
    const products = (successMatches ?? []).filter((p) => defaultRemovalIds.has(p.product_id))
    const tagIds = products.flatMap((p) => p.tags.map((t) => t.tag.id))
    const ids = pathSettings.filter((s) => tagIds.includes(s.product_tag_node_id)).map((s) => s.id)
    setRemovingEnabled(true)
    if (ids.length > 0) {
      const { error } = await supabase.from('product_inventory_path_settings').delete().in('id', ids)
      if (error) {
        setRemovingEnabled(false)
        window.alert(`移除失敗：${error.message}`)
        return
      }
    }
    setRemovingEnabled(false)
    setRemoveEnabledResult(ids.length > 0 ? `已移除 ${ids.length} 筆啟用項目（含其中的預設）` : '所選產品目前都沒有任何啟用項目')
    setDefaultRemovalIds(new Set())
    onChanged()
  }

  const toggleTarget = (productId: string) => {
    if (productId === sourceProductId) return
    setTargetProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
    setApplyResult(null)
  }

  const pickSource = (productId: string) => {
    setSourceProductId(productId)
    setTargetProductIds((prev) => {
      if (!prev.has(productId)) return prev
      const next = new Set(prev)
      next.delete(productId)
      return next
    })
    setApplyResult(null)
  }

  const applySettings = async () => {
    if (!sourceProductId || targetProductIds.size === 0) return
    const allProducts = [...(successMatches ?? []), ...(warningMatches ?? [])]
    const source = allProducts.find((p) => p.product_id === sourceProductId)
    if (!source) return
    setApplying(true)
    setApplyResult(null)

    const sourceTagIds = source.tags.map((t) => t.tag.id)
    const sourceSettings = pathSettings.filter((s) => sourceTagIds.includes(s.product_tag_node_id))

    let successCount = 0
    let failedCount = 0
    const upsertRows: { product_tag_node_id: string; path_id: string; enabled: boolean; is_default: boolean }[] = []
    const clearDefaultTagIds: string[] = []

    for (const targetId of targetProductIds) {
      const target = allProducts.find((p) => p.product_id === targetId)
      if (!target) {
        failedCount++
        continue
      }
      let appliedAny = false
      for (const sTag of source.tags) {
        // 目標產品要有「同名」的成品tag，而且這個tag自己也真的對上這個
        // diagram第一層的節點，才有辦法接收來源的入庫分類設定
        const tTag = target.tags.find((t) => t.tag.label === sTag.tag.label && t.matchedNodeId)
        if (!tTag || !tTag.matchedNodeId) continue
        const settingsForSourceTag = sourceSettings.filter((s) => s.product_tag_node_id === sTag.tag.id)
        if (settingsForSourceTag.length === 0) continue
        appliedAny = true
        let hasDefault = false
        for (const s of settingsForSourceTag) {
          upsertRows.push({
            product_tag_node_id: tTag.tag.id,
            path_id: s.path_id,
            enabled: true,
            is_default: s.is_default,
          })
          if (s.is_default) hasDefault = true
        }
        if (hasDefault) clearDefaultTagIds.push(tTag.tag.id)
      }
      if (appliedAny) successCount++
      else failedCount++
    }

    if (upsertRows.length > 0) {
      if (clearDefaultTagIds.length > 0) {
        const { error: clearError } = await supabase
          .from('product_inventory_path_settings')
          .update({ is_default: false })
          .in('product_tag_node_id', clearDefaultTagIds)
        if (clearError) {
          setApplying(false)
          window.alert(`套用失敗：${clearError.message}`)
          return
        }
      }
      const { error } = await supabase
        .from('product_inventory_path_settings')
        .upsert(upsertRows, { onConflict: 'product_tag_node_id,path_id' })
      if (error) {
        setApplying(false)
        window.alert(`套用失敗：${error.message}`)
        return
      }
    }

    setApplying(false)
    setApplyResult({ success: successCount, failed: failedCount })
    onChanged()
  }

  if (selectedProduct) {
    return (
      <ProductPathSettings
        product={selectedProduct}
        layers={layers}
        nodes={nodes}
        edges={edges}
        paths={paths}
        pathSettings={pathSettings}
        layerSync={layerSync}
        nodeLabel={nodeLabel}
        readOnly={readOnly}
        onBack={() => setSelectedProduct(null)}
        onChanged={onChanged}
      />
    )
  }

  return (
    <div className="border rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Match to Product（連結至產品）</h3>
        <button
          onClick={scan}
          disabled={scanning}
          className="bg-black text-white rounded px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {scanning ? '掃描中…' : '重新掃描比對'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        以「產品」為單位比對：一個產品自己所有的成品tag都精確對上這個分類第一層的節點，才算successful；只要少一個或名字對不上，整個產品算warning。
      </p>
      {scanError && <p className="text-xs text-red-600 mb-3">{scanError}</p>}
      {successMatches !== null && successMatches.length === 0 && warningMatches?.length === 0 && (
        <p className="text-xs text-gray-400 mb-3">系統裡目前沒有任何產品有成品tag，或這個diagram第一層還沒有節點。</p>
      )}
      {successMatches !== null && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setOpenList(openList === 'success' ? null : 'success')}
            className="text-xs bg-green-100 text-green-800 rounded-full px-3 py-1 font-medium"
          >
            successful match: ({successMatches.length})
          </button>
          <button
            onClick={() => setOpenList(openList === 'warning' ? null : 'warning')}
            className="text-xs bg-amber-100 text-amber-800 rounded-full px-3 py-1 font-medium"
          >
            warning match: ({warningMatches?.length ?? 0})
          </button>
        </div>
      )}
      {openList && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              onClick={applySettings}
              disabled={!sourceProductId || targetProductIds.size === 0 || applying}
              className="bg-black text-white rounded px-3 py-1.5 text-xs disabled:opacity-40"
            >
              {applying ? '套用中…' : `套用設定${targetProductIds.size > 0 ? `(${targetProductIds.size})` : ''}`}
            </button>
            <span className="text-[11px] text-gray-400">
              勾選「來源」（單選）一個已設定好入庫分類的產品，再勾選「目標」（可多選）要套用過去的產品
            </span>
          </div>
          {applyResult && (
            <p className="text-xs text-gray-700 mb-2">
              {applyResult.success} 個成功套用，{applyResult.failed} 個套用失敗
              {applyResult.failed > 0 && '（失敗代表該目標產品沒有任何一個成品tag名稱跟來源相同，或名稱相同但沒對上這個分類第一層節點，導致完全沒有東西可以套用）'}
            </p>
          )}
          {openList === 'success' && defaultRemovalIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <button
                onClick={removeDefaults}
                disabled={removingDefaults || removingEnabled}
                className="bg-red-600 text-white rounded px-3 py-1.5 text-xs disabled:opacity-40"
              >
                {removingDefaults ? '移除中…' : `移除預設路徑(${defaultRemovalIds.size})`}
              </button>
              <button
                onClick={removeEnabledAndDefaults}
                disabled={removingDefaults || removingEnabled}
                className="bg-red-800 text-white rounded px-3 py-1.5 text-xs disabled:opacity-40"
              >
                {removingEnabled ? '移除中…' : `移除啟用項目+預設路徑(${defaultRemovalIds.size})`}
              </button>
              <span className="text-[11px] text-gray-400">
                左邊只取消所選產品的預設；右邊連同啟用一起取消（會整筆刪除設定，畫布上的節點才會真的解鎖）
              </span>
            </div>
          )}
          {removeDefaultResult && <p className="text-xs text-gray-700 mb-2">{removeDefaultResult}</p>}
          {removeEnabledResult && <p className="text-xs text-gray-700 mb-2">{removeEnabledResult}</p>}
          <ul className="space-y-1">
            <li className="flex items-center gap-3 text-[11px] text-gray-400 px-1">
              <span className="w-4 text-center">來源</span>
              <span className="w-4 text-center">目標</span>
              {openList === 'success' && <span className="w-10 text-center">已設啟用</span>}
              {openList === 'success' && <span className="w-10 text-center">已設預設</span>}
              {openList === 'success' && <span className="w-4 text-center">選擇</span>}
              <span>產品</span>
            </li>
            {(openList === 'success' ? successMatches : warningMatches)?.map((p) => {
              const matchedCount = p.tags.filter((t) => t.matchedNodeId && t.matchedNodeLabel === t.tag.label).length
              const isSource = sourceProductId === p.product_id
              const enabledCount = p.tags.filter((t) => pathSettings.some((s) => s.product_tag_node_id === t.tag.id)).length
              const defaultCount = p.tags.filter((t) =>
                pathSettings.some((s) => s.product_tag_node_id === t.tag.id && s.is_default)
              ).length
              const numColor = (n: number, total: number) =>
                n === 0 ? 'text-red-600' : n === total ? 'text-green-600' : 'text-amber-600'
              return (
                <li key={p.product_id} className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="apply-source"
                    className="w-4 h-4"
                    checked={isSource}
                    onChange={() => pickSource(p.product_id)}
                  />
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={targetProductIds.has(p.product_id)}
                    disabled={isSource}
                    onChange={() => toggleTarget(p.product_id)}
                  />
                  {openList === 'success' && (
                    <span className="w-10 text-center text-[11px] text-gray-500 tabular-nums">
                      <span className={`font-semibold ${numColor(enabledCount, p.tags.length)}`}>{enabledCount}</span>/
                      {p.tags.length}
                    </span>
                  )}
                  {openList === 'success' && (
                    <span className="w-10 text-center text-[11px] text-gray-500 tabular-nums">
                      <span className={`font-semibold ${numColor(defaultCount, p.tags.length)}`}>{defaultCount}</span>/
                      {p.tags.length}
                    </span>
                  )}
                  {openList === 'success' && (
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={defaultRemovalIds.has(p.product_id)}
                      onChange={() => toggleDefaultRemoval(p.product_id)}
                    />
                  )}
                  <button onClick={() => setSelectedProduct(p)} className="text-xs text-blue-700 hover:underline">
                    {p.product_name}（{matchedCount}/{p.tags.length} 個成品tag對上）
                  </button>
                </li>
              )
            })}
            {(openList === 'success' ? successMatches : warningMatches)?.length === 0 && (
              <li className="text-xs text-gray-400">沒有符合的項目</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

function ProductPathSettings({
  product,
  layers,
  nodes,
  edges,
  paths,
  pathSettings,
  layerSync,
  nodeLabel,
  readOnly,
  onBack,
  onChanged,
}: {
  product: ProductMatch
  layers: Layer[]
  nodes: NodeRow[]
  edges: EdgeRow[]
  paths: PathRow[]
  pathSettings: PathSetting[]
  layerSync: LayerSync[]
  nodeLabel: (id: string) => string
  readOnly: boolean
  onBack: () => void
  onChanged: () => void
}) {
  const [busyPathId, setBusyPathId] = useState<string | null>(null)
  const [busyTagId, setBusyTagId] = useState<string | null>(null)
  // 每個tag自己「畫面上勾了、但還沒湊成完整路徑」的暫存節點勾選，放在
  // 這裡（跟所有tag共用的父層元件）而不是各自diagram元件的local state，
  // 這樣不同tag的畫面才能互相看到彼此還在進行中的勾選、達到「每勾一個
  // 節點就立刻同步」的效果
  const [pendingByTag, setPendingByTag] = useState<Record<string, Set<string>>>({})
  const [nodeBusy, setNodeBusy] = useState(false)
  // 每次進來這個產品的頁面，預設只看已經啟用的品項；不勾就顯示全部
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(true)
  const settingFor = (tagId: string, pathId: string) =>
    pathSettings.find((s) => s.product_tag_node_id === tagId && s.path_id === pathId)

  // 品項排序＝照diagram本身的排法：先掃第一層（由上而下＝節點建立順序），
  // 再掃第二層…依此類推逐層往右；node_ids[i]保證對應depth=i+1的節點
  // （連線只允許接相鄰層），所以逐一比較同一個index位置的層內排序就好
  const nodeOrderInLayer = new Map<string, number>()
  for (const layer of [...layers].sort((a, b) => a.depth - b.depth)) {
    nodes
      .filter((n) => n.layer_id === layer.id)
      .forEach((n, i) => nodeOrderInLayer.set(n.id, i))
  }
  const sortPaths = (rows: PathRow[]) =>
    [...rows].sort((a, b) => {
      const len = Math.max(a.node_ids.length, b.node_ids.length)
      for (let i = 0; i < len; i++) {
        const av = a.node_ids[i] !== undefined ? nodeOrderInLayer.get(a.node_ids[i]) ?? 0 : -1
        const bv = b.node_ids[i] !== undefined ? nodeOrderInLayer.get(b.node_ids[i]) ?? 0 : -1
        if (av !== bv) return av - bv
      }
      return 0
    })

  const isSyncOn = (tagId: string, layerId: string) =>
    layerSync.some((s) => s.product_tag_node_id === tagId && s.layer_id === layerId)

  const tagAnchor = (tagId: string) => product.tags.find((t) => t.tag.id === tagId)?.matchedNodeId ?? null
  const tagRelevantPaths = (tagId: string) => {
    const anchor = tagAnchor(tagId)
    return anchor ? paths.filter((p) => p.node_ids[0] === anchor) : []
  }
  // 「確定」的已啟用節點（真的寫進資料庫的），跟畫面上還沒湊完整條路徑
  // 之前的「暫存」勾選(pendingByTag)分開算：兩者聯集才是畫面上實際顯示
  // 打勾的狀態
  const tagConfirmed = (tagId: string) => {
    const anchor = tagAnchor(tagId)
    if (!anchor) return new Set<string>()
    const enabledIds = new Set(pathSettings.filter((s) => s.product_tag_node_id === tagId).map((s) => s.path_id))
    const set = new Set<string>([anchor])
    for (const p of tagRelevantPaths(tagId)) if (enabledIds.has(p.id)) for (const id of p.node_ids) set.add(id)
    return set
  }
  const tagChecked = (tagId: string, pendingMap: Record<string, Set<string>> = pendingByTag) =>
    new Set<string>([...tagConfirmed(tagId), ...(pendingMap[tagId] ?? [])])

  // 對一批tag，把某個node設成勾/取消勾：先算出更新後的暫存勾選map，再
  // 各自比對「這個node設完之後」有沒有因此湊出/拆掉一條完整路徑，寫進
  // 資料庫；回傳更新後的map，方便呼叫端接續往下疊加多個node
  const applyNodeState = async (
    tagIds: string[],
    nodeId: string,
    checked: boolean,
    pendingBase: Record<string, Set<string>>
  ) => {
    const nextPending: Record<string, Set<string>> = { ...pendingBase }
    for (const tid of tagIds) {
      const cur = new Set(nextPending[tid] ?? [])
      if (checked) cur.add(nodeId)
      else cur.delete(nodeId)
      nextPending[tid] = cur
    }
    const upserts: { product_tag_node_id: string; path_id: string; enabled: boolean; is_default: boolean }[] = []
    const deleteIds: string[] = []
    for (const tid of tagIds) {
      const tagPaths = tagRelevantPaths(tid)
      const enabledIds = new Set(pathSettings.filter((s) => s.product_tag_node_id === tid).map((s) => s.path_id))
      const checkedNow = tagChecked(tid, nextPending)
      if (checked) {
        const newlyComplete = tagPaths.filter((p) => !enabledIds.has(p.id) && p.node_ids.every((id) => checkedNow.has(id)))
        for (const p of newlyComplete) upserts.push({ product_tag_node_id: tid, path_id: p.id, enabled: true, is_default: false })
      } else {
        const toDisable = tagPaths.filter((p) => enabledIds.has(p.id) && p.node_ids.includes(nodeId))
        for (const p of toDisable) {
          const existing = pathSettings.find((s) => s.product_tag_node_id === tid && s.path_id === p.id)
          if (existing) deleteIds.push(existing.id)
        }
      }
    }
    if (upserts.length > 0) {
      const { error } = await supabase.from('product_inventory_path_settings').upsert(upserts, { onConflict: 'product_tag_node_id,path_id' })
      if (error) window.alert(`提交錯誤：${error.message}`)
    }
    if (deleteIds.length > 0) {
      const { error } = await supabase.from('product_inventory_path_settings').delete().in('id', deleteIds)
      if (error) window.alert(`提交錯誤：${error.message}`)
    }
    return nextPending
  }

  // 畫面上點一個node的checkbox：不管有沒有湊成完整路徑，只要來源這一層
  // 有開Sync，就立刻把「這個node勾/取消勾」這件事同步到也走得到這個
  // node的其他tag（一起更新暫存勾選，湊滿的話也一起寫進資料庫）
  const handleNodeToggle = async (sourceTagId: string, nodeId: string) => {
    if (readOnly || nodeBusy) return
    const anchor = tagAnchor(sourceTagId)
    if (!anchor || nodeId === anchor) return
    const layerId = nodes.find((n) => n.id === nodeId)?.layer_id
    const nextChecked = !tagChecked(sourceTagId).has(nodeId)

    const affected = new Set<string>([sourceTagId])
    if (layerId && isSyncOn(sourceTagId, layerId)) {
      for (const sib of product.tags) {
        if (sib.tag.id === sourceTagId || !sib.matchedNodeId) continue
        if (tagRelevantPaths(sib.tag.id).some((p) => p.node_ids.includes(nodeId))) affected.add(sib.tag.id)
      }
    }

    // busy要撐到onChanged()（重新抓最新pathSettings）真的做完才解除，不然
    // 使用者連續快速點好幾個checkbox時，後面那次點擊會抓到還沒refresh的
    // 舊pathSettings去判斷「這條路徑是不是已經啟用過」，可能誤判、甚至
    // 反過來把剛剛才啟用的東西當成還沒啟用又寫一次/或誤刪
    setNodeBusy(true)
    const nextPending = await applyNodeState([...affected], nodeId, nextChecked, pendingByTag)
    setPendingByTag(nextPending)
    await onChanged()
    setNodeBusy(false)
  }

  const toggleSync = async (tagId: string, layerId: string) => {
    if (isSyncOn(tagId, layerId)) {
      await supabase.from('product_tag_layer_sync').delete().eq('product_tag_node_id', tagId).eq('layer_id', layerId)
      onChanged()
      return
    }
    const { error } = await supabase
      .from('product_tag_layer_sync')
      .upsert({ product_tag_node_id: tagId, layer_id: layerId }, { onConflict: 'product_tag_node_id,layer_id' })
    if (error) {
      window.alert(`開啟Sync失敗：${error.message}`)
      return
    }
    setNodeBusy(true)
    // 立刻回溯：把這個tag目前在這一層已經勾起來（含畫面上還沒湊完整條
    // 路徑的暫存勾選）的節點，逐一同步給也走得到那個node的其他tag
    let pendingSnapshot = pendingByTag
    const nodesAtLayer = nodes.filter((n) => n.layer_id === layerId && tagChecked(tagId, pendingSnapshot).has(n.id))
    for (const n of nodesAtLayer) {
      const siblings = product.tags.filter(
        (t) => t.tag.id !== tagId && t.matchedNodeId && tagRelevantPaths(t.tag.id).some((p) => p.node_ids.includes(n.id))
      )
      if (siblings.length === 0) continue
      pendingSnapshot = await applyNodeState(
        siblings.map((s) => s.tag.id),
        n.id,
        true,
        pendingSnapshot
      )
    }
    setPendingByTag(pendingSnapshot)

    // 這一層以內、目前是這個tag預設路徑的那一條，回溯時把「預設」身分
    // 也一併對應套用給對方剛好走到同一組合的路徑（只在打開Sync的當下
    // 做這一次，之後預設的異動不會再自動同步）
    const anchor = tagAnchor(tagId)
    if (anchor) {
      const layerDepth = layers.find((l) => l.id === layerId)?.depth ?? 0
      const idx = layerDepth - 1
      const tagPaths = tagRelevantPaths(tagId)
      const defaultPath =
        idx >= 0
          ? tagPaths.find(
              (p) =>
                p.node_ids[idx] !== undefined &&
                pathSettings.some((s) => s.product_tag_node_id === tagId && s.path_id === p.id && s.is_default)
            )
          : undefined
      if (defaultPath) {
        const suffix = defaultPath.node_ids.slice(1)
        for (const sib of product.tags.filter((t) => t.tag.id !== tagId && t.matchedNodeId)) {
          const sibPaths = tagRelevantPaths(sib.tag.id)
          const match = sibPaths.find(
            (p) => p.node_ids.length === defaultPath.node_ids.length && p.node_ids.slice(1).every((id, i) => id === suffix[i])
          )
          if (!match) continue
          await supabase
            .from('product_inventory_path_settings')
            .update({ is_default: false })
            .eq('product_tag_node_id', sib.tag.id)
            .eq('is_default', true)
          await supabase
            .from('product_inventory_path_settings')
            .upsert(
              { product_tag_node_id: sib.tag.id, path_id: match.id, enabled: true, is_default: true },
              { onConflict: 'product_tag_node_id,path_id' }
            )
        }
      }
    }
    setNodeBusy(false)
    onChanged()
  }

  const toggleEnabled = async (tagId: string, pathId: string) => {
    const existing = settingFor(tagId, pathId)
    setBusyPathId(pathId)
    // 取消啟用＝直接刪掉這筆設定（不是留著改成 enabled:false），這樣
    // recompute_diagram_paths() 的「還有沒有被引用」檢查才會真的解鎖，
    // 畫布上才能繼續延展/刪除這個節點
    const { error } = existing
      ? await supabase.from('product_inventory_path_settings').delete().eq('id', existing.id)
      : await supabase
          .from('product_inventory_path_settings')
          .upsert(
            { product_tag_node_id: tagId, path_id: pathId, enabled: true, is_default: false },
            { onConflict: 'product_tag_node_id,path_id' }
          )
    setBusyPathId(null)
    if (error) window.alert(`提交錯誤：${error.message}`)
    else onChanged()
  }

  // 全選＝把還沒啟用的都補上一筆enabled:true；全不選＝直接刪掉這個tag底下
  // 所有已啟用的設定（連同它們的預設一起消失，跟單筆取消啟用同一個道理）
  const toggleAllForTag = async (tagId: string, relevantPaths: PathRow[]) => {
    const existingByPath = new Map(relevantPaths.map((p) => [p.id, settingFor(tagId, p.id)]))
    const allEnabled = relevantPaths.length > 0 && relevantPaths.every((p) => existingByPath.get(p.id)?.enabled)
    setBusyTagId(tagId)
    let error: { message: string } | null = null
    if (allEnabled) {
      const ids = relevantPaths.map((p) => existingByPath.get(p.id)?.id).filter((id): id is string => !!id)
      if (ids.length > 0) {
        ;({ error } = await supabase.from('product_inventory_path_settings').delete().in('id', ids))
      }
    } else {
      const rows = relevantPaths
        .filter((p) => !existingByPath.get(p.id)?.enabled)
        .map((p) => ({ product_tag_node_id: tagId, path_id: p.id, enabled: true, is_default: false }))
      if (rows.length > 0) {
        ;({ error } = await supabase
          .from('product_inventory_path_settings')
          .upsert(rows, { onConflict: 'product_tag_node_id,path_id' }))
      }
    }
    setBusyTagId(null)
    if (error) window.alert(`提交錯誤：${error.message}`)
    else onChanged()
  }

  const setDefault = async (tagId: string, pathId: string) => {
    setBusyPathId(pathId)
    const current = pathSettings.filter((s) => s.product_tag_node_id === tagId && s.is_default)
    for (const c of current) {
      if (c.path_id !== pathId) {
        await supabase.from('product_inventory_path_settings').update({ is_default: false }).eq('id', c.id)
      }
    }
    const { error } = await supabase
      .from('product_inventory_path_settings')
      .upsert(
        { product_tag_node_id: tagId, path_id: pathId, enabled: true, is_default: true },
        { onConflict: 'product_tag_node_id,path_id' }
      )
    setBusyPathId(null)
    if (error) window.alert(`提交錯誤：${error.message}`)
    else onChanged()
  }

  return (
    <div>
      <button onClick={onBack} className="text-xs text-blue-700 underline mb-2">
        ← 返回比對結果
      </button>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">媒合的品項：{product.product_name}</h4>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showOnlyEnabled}
            onChange={() => setShowOnlyEnabled((x) => !x)}
          />
          只顯示啟用的選項
        </label>
      </div>
      <div className="space-y-4">
        {product.tags.map((tm) => {
          if (!tm.matchedNodeId) {
            return (
              <div key={tm.tag.id}>
                <p className="text-xs font-medium mb-1">{tm.tag.label}</p>
                <p className="text-xs text-amber-700">這個diagram第一層還沒有對應節點，請先去畫布新增。</p>
              </div>
            )
          }
          const relevantPaths = sortPaths(paths.filter((p) => p.node_ids[0] === tm.matchedNodeId))
          const enabledPaths = relevantPaths.filter((p) => settingFor(tm.tag.id, p.id)?.enabled)
          const displayedPaths = showOnlyEnabled ? enabledPaths : relevantPaths
          return (
            <div key={tm.tag.id}>
              <p className="text-xs font-medium mb-1">
                {tm.tag.label}
                {tm.matchedNodeLabel !== tm.tag.label && (
                  <span className="text-amber-700"> （第一層節點名稱是「{tm.matchedNodeLabel}」，疑似打錯字）</span>
                )}
              </p>
              <ProductDiagramView
                layers={layers}
                nodes={nodes}
                edges={edges}
                matchedNodeId={tm.matchedNodeId}
                relevantPaths={relevantPaths}
                pathSettings={pathSettings}
                tagId={tm.tag.id}
                readOnly={readOnly}
                checkedIds={tagChecked(tm.tag.id)}
                busy={nodeBusy}
                onToggleNode={(nodeId) => handleNodeToggle(tm.tag.id, nodeId)}
                isSyncOn={isSyncOn}
                onToggleSync={toggleSync}
              />
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left border-b bg-gray-50">
                      <th className="py-1.5 px-2">
                        品項(
                        {showOnlyEnabled ? enabledPaths.length : `${enabledPaths.length}/${relevantPaths.length}`}
                        )
                      </th>
                      <th className="py-1.5 px-2 w-16 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>啟用</span>
                          <MasterCheckbox
                            total={relevantPaths.length}
                            checkedCount={enabledPaths.length}
                            disabled={readOnly || busyTagId === tm.tag.id}
                            onChange={() => toggleAllForTag(tm.tag.id, relevantPaths)}
                          />
                        </div>
                      </th>
                      <th className="py-1.5 px-2 w-16 text-center">預設</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedPaths.length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-2 px-2 text-center text-gray-400">
                          {showOnlyEnabled ? '目前沒有啟用的品項' : '沒有品項'}
                        </td>
                      </tr>
                    )}
                    {displayedPaths.map((p) => {
                      const s = settingFor(tm.tag.id, p.id)
                      const enabled = !!s?.enabled
                      const isDefault = !!s?.is_default
                      return (
                        <tr key={p.id} className="border-b last:border-b-0">
                          <td className="py-1.5 px-2">{p.node_ids.map(nodeLabel).join('・')}</td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="checkbox"
                              checked={enabled}
                              disabled={readOnly || busyPathId === p.id}
                              onChange={() => toggleEnabled(tm.tag.id, p.id)}
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="radio"
                              name={`default-path-${tm.tag.id}`}
                              checked={isDefault}
                              disabled={readOnly || !enabled || busyPathId === p.id}
                              onChange={() => setDefault(tm.tag.id, p.id)}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// per-tag「勾節點＝啟用」圖表：跟下面的表格是同一份 pathSettings，
// 只是兩種不同的修改方式——在圖上把某條路徑每一層的節點都勾滿，就等
// 於在下面表格把那條路徑的「啟用」打勾；反過來表格的勾選/取消也會
// 立刻反映在這張圖的紅線上。
// ============================================================
function ProductDiagramView({
  layers,
  nodes,
  edges,
  matchedNodeId,
  relevantPaths,
  pathSettings,
  tagId,
  readOnly,
  checkedIds,
  busy,
  onToggleNode,
  isSyncOn,
  onToggleSync,
}: {
  layers: Layer[]
  nodes: NodeRow[]
  edges: EdgeRow[]
  matchedNodeId: string
  relevantPaths: PathRow[]
  pathSettings: PathSetting[]
  tagId: string
  readOnly: boolean
  checkedIds: Set<string>
  busy: boolean
  onToggleNode: (nodeId: string) => void
  isSyncOn: (tagId: string, layerId: string) => boolean
  onToggleSync: (tagId: string, layerId: string) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [, forceRerender] = useState(0)

  const relevantNodeIds = new Set<string>([matchedNodeId])
  for (const p of relevantPaths) for (const id of p.node_ids) relevantNodeIds.add(id)

  const visibleLayers = layers.filter((l) => nodes.some((n) => n.layer_id === l.id && relevantNodeIds.has(n.id)))
  const nodesByLayer = (layerId: string) => nodes.filter((n) => n.layer_id === layerId && relevantNodeIds.has(n.id))
  const visibleEdges = edges.filter((e) => relevantNodeIds.has(e.from_node_id) && relevantNodeIds.has(e.to_node_id))

  const defaultPathIds = new Set(
    pathSettings.filter((s) => s.product_tag_node_id === tagId && s.is_default).map((s) => s.path_id)
  )

  const completePathIds = new Set(relevantPaths.filter((p) => p.node_ids.every((id) => checkedIds.has(id))).map((p) => p.id))
  const isNodeComplete = (nodeId: string) =>
    relevantPaths.some((p) => completePathIds.has(p.id) && p.node_ids.includes(nodeId))
  const isNodeDefault = (nodeId: string) => relevantPaths.some((p) => defaultPathIds.has(p.id) && p.node_ids.includes(nodeId))
  const isEdgeComplete = (fromId: string, toId: string) =>
    relevantPaths.some((p) => {
      if (!completePathIds.has(p.id)) return false
      const idx = p.node_ids.indexOf(fromId)
      return idx !== -1 && p.node_ids[idx + 1] === toId
    })
  const isEdgeDefault = (fromId: string, toId: string) =>
    relevantPaths.some((p) => {
      if (!defaultPathIds.has(p.id)) return false
      const idx = p.node_ids.indexOf(fromId)
      return idx !== -1 && p.node_ids[idx + 1] === toId
    })

  useEffect(() => {
    const bump = () => forceRerender((x) => x + 1)
    const raf = requestAnimationFrame(bump)
    window.addEventListener('resize', bump)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', bump)
    }
  }, [visibleLayers.length, relevantNodeIds.size, visibleEdges.length])

  const centerOf = (nodeId: string) => {
    const el = document.getElementById(`inv-pd-${tagId}-${nodeId}`)
    const board = boardRef.current
    if (!el || !board) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const b = board.getBoundingClientRect()
    return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top }
  }

  return (
    <div className="border rounded-lg bg-white p-3 mb-2">
      <div ref={boardRef} className="relative flex gap-6 overflow-x-auto pb-2" style={{ minHeight: 40 }}>
        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {visibleEdges.map((edge) => {
            const p1 = centerOf(edge.from_node_id)
            const p2 = centerOf(edge.to_node_id)
            const complete = isEdgeComplete(edge.from_node_id, edge.to_node_id)
            const isDefault = isEdgeDefault(edge.from_node_id, edge.to_node_id)
            const mx = (p1.x + p2.x) / 2
            return (
              <path
                key={edge.id}
                d={`M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`}
                stroke={isDefault ? '#16a34a' : complete ? '#dc2626' : '#d1d5db'}
                strokeWidth={isDefault ? 4 : complete ? 2.2 : 1.4}
                fill="none"
              />
            )
          })}
        </svg>
        {visibleLayers.map((layer) => (
          <div key={layer.id} className="relative z-10 flex flex-col items-center gap-2 min-w-[120px]">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{layer.name}</span>
            {layer.depth >= 2 && (
              <label
                className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer select-none"
                title="開啟後，之後在這一層勾/取消勾節點，會廣播套用到同一個產品的其他成品tag（對方有走到同樣的節點才會生效）"
              >
                <input
                  type="checkbox"
                  className="w-3 h-3"
                  disabled={readOnly}
                  checked={isSyncOn(tagId, layer.id)}
                  onChange={() => onToggleSync(tagId, layer.id)}
                />
                Sync
              </label>
            )}
            {nodesByLayer(layer.id).map((n) => {
              const fixed = n.id === matchedNodeId
              const complete = isNodeComplete(n.id)
              const isDefault = isNodeDefault(n.id)
              return (
                <div
                  key={n.id}
                  id={`inv-pd-${tagId}-${n.id}`}
                  className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border ${
                    isDefault
                      ? 'border-2 border-green-600 bg-green-100 text-green-800 font-semibold'
                      : complete
                        ? 'border-red-300 bg-red-50 text-red-700'
                        : 'border-gray-300 bg-gray-50 text-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5"
                    checked={fixed || checkedIds.has(n.id)}
                    disabled={readOnly || fixed || busy}
                    onChange={() => onToggleNode(n.id)}
                  />
                  <span>{n.label}</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        勾選節點＝啟用；每一層都勾到底湊成一條完整路徑，那條路徑就會變紅、同時自動啟用（跟下面表格互相同步）。在下面表格設為「預設」的那條路徑，這裡會用綠色粗線＋綠框標示。有開Sync的層，每勾/取消勾一個節點，會立刻同步到同一個產品其他成品tag的畫面（即使還沒湊成完整路徑）。
      </p>
    </div>
  )
}

function MasterCheckbox({
  total,
  checkedCount,
  disabled,
  onChange,
}: {
  total: number
  checkedCount: number
  disabled: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const allChecked = total > 0 && checkedCount === total
  const someChecked = checkedCount > 0 && !allChecked

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someChecked
  }, [someChecked])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allChecked}
      disabled={disabled || total === 0}
      onChange={onChange}
      title={allChecked ? '取消全部啟用' : '全部啟用'}
    />
  )
}
