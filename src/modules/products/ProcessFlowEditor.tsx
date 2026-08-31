import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { Tables } from '@/shared/types/database'

type NodeRow = Tables<'process_nodes'>
type EdgeRow = Tables<'process_edges'>
type CategoryBoxRow = Tables<'category_boxes'>

const ACT_W = 132
const ACT_H_BASE = 44

function newId(): string {
  return crypto.randomUUID()
}

export type ProcessFlowScope = { type: 'product'; id: string } | { type: 'template'; id: string }

export function ProcessFlowEditor({
  scope,
  editable: editableProp,
  onChanged,
  toolbarExtra,
}: {
  scope: ProcessFlowScope
  editable: boolean
  onChanged?: () => void
  toolbarExtra?: ReactNode
}) {
  // the pointer-drag/connect/right-click editing model here needs a real
  // mouse (or equivalent fine pointer) — on a touch-only device (phone,
  // tablet with no attached mouse) force view-only regardless of the
  // caller's `editable` prop, and swap the canvas back to normal touch
  // scrolling so the whole diagram can still be panned around
  const [hasFinePointer, setHasFinePointer] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)')
    const handler = () => setHasFinePointer(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const editable = editableProp && hasFinePointer
  const editBlockedByDevice = editableProp && !hasFinePointer

  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [edges, setEdges] = useState<EdgeRow[]>([])
  const [categoryBoxes, setCategoryBoxes] = useState<CategoryBoxRow[]>([])
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null)
  const connectRef = useRef<{ fromId: string; fromIsAction: boolean } | null>(null)
  const boxDragRef = useRef<{ id: string; offX: number; offY: number } | null>(null)
  const boxResizeRef = useRef<{ id: string; corner: 'nw' | 'ne' | 'sw' | 'se' } | null>(null)
  const [connectLine, setConnectLine] = useState<{ fx: number; fy: number; tx: number; ty: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [nodeContextMenu, setNodeContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)

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
  // action/wait cards have no explicit height — it grows with however many
  // output rows exist — so their real rendered size is measured too, rather
  // than trusting the actionHeight() formula's estimate for anchor points
  const actionCardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
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

  // shared by the initial load AND any mid-session silent refetch — kept
  // separate from the setLoading(true/false) wrapper below so a refetch
  // never unmounts the canvas (which would reset its scroll position)
  const fetchAndApply = async () => {
    const [{ data: nodeRows }, { data: edgeRows }, { data: boxRows }] = await Promise.all([
      supabase.from('process_nodes').select('*').eq(scopeCol, scope.id),
      supabase.from('process_edges').select('*').eq(scopeCol, scope.id).order('sort_order'),
      supabase.from('category_boxes').select('*').eq(scopeCol, scope.id),
    ])
    setCategoryBoxes(boxRows ?? [])
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
  }

  const load = async () => {
    setLoading(true)
    await fetchAndApply()
    setLoading(false)
  }

  const findNode = (id: string) => nodes.find((n) => n.id === id)
  const isAction = (id: string) => findNode(id)?.kind === 'action'
  // sort locally (not just filter) so a reorder swap re-renders in its new
  // position immediately, instead of only after a reload re-fetches sorted
  const outEdgesOfAction = (id: string) => edges.filter((e) => e.from_node_id === id).sort((a, b) => a.sort_order - b.sort_order)
  const tagHasOutgoing = (id: string) => edges.some((e) => e.from_node_id === id)

  // wait nodes carry an extra "（系統自動）" line that needs more room
  const actionWidth = (n: NodeRow) => (n.wait_days != null ? ACT_W * 1.1 : ACT_W)

  const actionHeight = (n: NodeRow) => {
    const outs = outEdgesOfAction(n.id).length
    return ACT_H_BASE + 28 + Math.max(outs, 1) * 24 + 4
  }

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

  // Directional edge routing: a tag's rounded outline is split into 8
  // compass points — the upper-left arc (W/NW/N/NE) serves incoming edges,
  // the lower-right arc (E/SE/S/SW) serves outgoing ones — and whichever
  // line is actually being drawn picks whichever of its 4 candidates points
  // most directly at the other end, instead of always using a fixed side.
  type Compass = 'W' | 'NW' | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW'
  const COMPASS_ANGLE: Record<Compass, number> = { E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: 225, N: 270, NE: 315 }
  // unit vector each side faces outward — used to make a connector actually
  // leave/arrive along that side instead of a curve that's horizontal no
  // matter which port it's attached to
  const COMPASS_VECTOR: Record<Compass, { x: number; y: number }> = {
    E: { x: 1, y: 0 },
    SE: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    S: { x: 0, y: 1 },
    SW: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    W: { x: -1, y: 0 },
    NW: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
    N: { x: 0, y: -1 },
    NE: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  }
  const TAG_INPUT_CANDIDATES: Compass[] = ['W', 'NW', 'N', 'NE']
  const TAG_OUTPUT_CANDIDATES: Compass[] = ['E', 'SE', 'S', 'SW']

  // `preferred` (the straight-across side — W for an input, E for an output)
  // wins outright whenever the two nodes are within 45° of level with each
  // other, rather than the plain nearest-of-4 rule tipping into a diagonal
  // as soon as the angle passes the diagonal's own halfway point (22.5°) —
  // a nearly-flat connection should still read as a flat line.
  const nearestCompass = (dx: number, dy: number, candidates: Compass[], preferred?: Compass): Compass => {
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI
    if (deg < 0) deg += 360
    if (preferred) {
      let pDiff = Math.abs(COMPASS_ANGLE[preferred] - deg)
      if (pDiff > 180) pDiff = 360 - pDiff
      if (pDiff <= 45) return preferred
    }
    let best = candidates[0]
    let bestDiff = Infinity
    for (const c of candidates) {
      let diff = Math.abs(COMPASS_ANGLE[c] - deg)
      if (diff > 180) diff = 360 - diff
      if (diff < bestDiff) {
        bestDiff = diff
        best = c
      }
    }
    return best
  }

  // measured when the pill is on screen (it always renders, even in view
  // mode), falling back to a formula guess only before the DOM has committed
  const tagAnchorPoints = (n: NodeRow) => {
    const canvas = canvasRef.current
    const el = tagPillRefs.current.get(n.id)
    let left: number, top: number, right: number, bottom: number
    if (el && canvas) {
      const er = el.getBoundingClientRect()
      const cr = canvas.getBoundingClientRect()
      left = er.left - cr.left
      top = er.top - cr.top
      right = er.right - cr.left
      bottom = er.bottom - cr.top
    } else {
      left = n.pos_x
      top = n.pos_y
      right = n.pos_x + 84
      bottom = n.pos_y + 32
    }
    const midX = (left + right) / 2
    const midY = (top + bottom) / 2
    // the pill is a stadium shape (rounded-full): N/S/E/W sit exactly on its
    // flat edges/tips, but a bounding-box corner (e.g. plain `left,top` for
    // NW) falls in the rounded cap's cut-off corner, outside the actual
    // outline — the diagonals instead need a point measured on the cap's own
    // circular arc, radius = half the pill's height, at 45°
    const r = (bottom - top) / 2
    const k = r * Math.SQRT1_2
    const leftCapX = left + r
    const rightCapX = right - r
    const points: Record<Compass, { x: number; y: number }> = {
      W: { x: left, y: midY },
      NW: { x: leftCapX - k, y: midY - k },
      N: { x: midX, y: top },
      NE: { x: rightCapX + k, y: midY - k },
      E: { x: right, y: midY },
      SE: { x: rightCapX + k, y: midY + k },
      S: { x: midX, y: bottom },
      SW: { x: leftCapX - k, y: midY + k },
    }
    return { points, center: { x: midX, y: midY } }
  }

  // action/wait cards have no fixed height (it grows with however many
  // output rows are listed) — measure the real rendered box rather than
  // trusting actionHeight()'s estimate, which drifted once more content
  // (like the wait-days line) changed the card's real height
  const actionRect = (n: NodeRow): { width: number; height: number } => {
    const canvas = canvasRef.current
    const el = actionCardRefs.current.get(n.id)
    if (el && canvas) {
      const er = el.getBoundingClientRect()
      return { width: er.width, height: er.height }
    }
    return { width: actionWidth(n), height: actionHeight(n) }
  }

  const actionCenter = (n: NodeRow) => {
    const r = actionRect(n)
    return { x: n.pos_x + r.width / 2, y: n.pos_y + r.height / 2 }
  }

  // action/wait nodes only ever get an input port on 3 sides — N/S when the
  // source tag sits clearly above/below, W otherwise (the normal left-to-right case)
  const actionInputAnchorPoints = (n: NodeRow): Record<'N' | 'W' | 'S', { x: number; y: number }> => {
    const r = actionRect(n)
    return {
      N: { x: n.pos_x + r.width / 2, y: n.pos_y },
      W: { x: n.pos_x, y: n.pos_y + 26 },
      S: { x: n.pos_x + r.width / 2, y: n.pos_y + r.height },
    }
  }

  // was previously "N/S whenever the source tag's y falls outside the
  // action's own (often short) vertical span" — with rows/lanes spaced much
  // further apart than a card's height, that tipped to N/S for almost any
  // multi-row layout. Switched to the same angle-based rule as the tag
  // side: W wins whenever the two boxes are within 45° of level, which
  // actually accounts for how far apart they are horizontally too.
  const actionInputDirection = (source: { x: number; y: number }, action: NodeRow): 'N' | 'W' | 'S' => {
    const ref = actionCenter(action)
    return nearestCompass(source.x - ref.x, source.y - ref.y, ['N', 'W', 'S'], 'W') as 'N' | 'W' | 'S'
  }

  const edgeEndpoints = (e: EdgeRow) => {
    const from = findNode(e.from_node_id)
    const to = findNode(e.to_node_id)
    if (!from || !to) return null
    if (from.kind === 'action') {
      // action -> tag: the action's own output-row dot stays fixed, only the
      // tag's landing side is chosen directionally
      const idx = outEdgesOfAction(from.id).findIndex((x) => x.id === e.id)
      const fallback = { x: from.pos_x + actionWidth(from), y: from.pos_y + ACT_H_BASE + 28 + idx * 24 + 12 }
      const p1 = measuredPos(outputDotRefs.current.get(e.id)) ?? fallback
      const tagAnchors = tagAnchorPoints(to)
      // decide direction from the action's overall box position, not this
      // specific output row's dot — a row stacked further down a tall
      // multi-output card sits well below the tag even when the two boxes
      // are roughly level, which wrongly tipped this into N/S
      const fromRef = actionCenter(from)
      const dir = nearestCompass(fromRef.x - tagAnchors.center.x, fromRef.y - tagAnchors.center.y, TAG_INPUT_CANDIDATES, 'W')
      const p2 = tagAnchors.points[dir]
      return { fx: p1.x, fy: p1.y, tx: p2.x, ty: p2.y, fromDir: 'E' as Compass, toDir: dir }
    }
    // tag -> action: both ends are chosen directionally
    const tagAnchors = tagAnchorPoints(from)
    const targetCenter = actionCenter(to)
    const outDir = nearestCompass(targetCenter.x - tagAnchors.center.x, targetCenter.y - tagAnchors.center.y, TAG_OUTPUT_CANDIDATES, 'E')
    const p3 = tagAnchors.points[outDir]
    const inDir = actionInputDirection(tagAnchors.center, to)
    const p4 = actionInputAnchorPoints(to)[inDir]
    return { fx: p3.x, fy: p3.y, tx: p4.x, ty: p4.y, fromDir: outDir, toDir: inDir as Compass }
  }

  // the curve's control points are pulled out along each end's own compass
  // direction, so it actually departs/arrives along that side (and the
  // arrow, which auto-orients to the path's tangent, points the right way)
  // instead of the old fixed left-to-right S-curve.
  const pathFor = (p: { fx: number; fy: number; tx: number; ty: number; fromDir?: Compass; toDir?: Compass }) => {
    const fv = COMPASS_VECTOR[p.fromDir ?? 'E']
    const tv = COMPASS_VECTOR[p.toDir ?? 'W']
    const dist = Math.hypot(p.tx - p.fx, p.ty - p.fy)
    const offset = Math.max(24, Math.min(dist * 0.5, 70))
    const c1x = p.fx + fv.x * offset
    const c1y = p.fy + fv.y * offset
    const c2x = p.tx + tv.x * offset
    const c2y = p.ty + tv.y * offset
    return `M ${p.fx} ${p.fy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p.tx} ${p.ty}`
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

  const startBoxDrag = (ev: React.PointerEvent, box: CategoryBoxRow) => {
    if (!editable) return
    ev.stopPropagation()
    const rect = canvasRef.current!.getBoundingClientRect()
    boxDragRef.current = { id: box.id, offX: ev.clientX - rect.left - box.pos_x, offY: ev.clientY - rect.top - box.pos_y }
    ev.preventDefault()
  }

  const startBoxResize = (ev: React.PointerEvent, box: CategoryBoxRow, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    if (!editable) return
    ev.stopPropagation()
    boxResizeRef.current = { id: box.id, corner }
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
      // capture the id now — dragRef.current can be nulled by onPointerUp
      // before this functional update actually runs, and re-reading the
      // (by-then-null) ref inside the updater crashed the whole page
      const id = dragRef.current.id
      const x = Math.max(0, ev.clientX - rect.left - dragRef.current.offX)
      const y = Math.max(0, Math.min(rect.height - 30, ev.clientY - rect.top - dragRef.current.offY))
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, pos_x: x, pos_y: y } : n)))
    } else if (boxDragRef.current) {
      const id = boxDragRef.current.id
      const x = Math.max(0, ev.clientX - rect.left - boxDragRef.current.offX)
      const y = Math.max(0, ev.clientY - rect.top - boxDragRef.current.offY)
      setCategoryBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, pos_x: x, pos_y: y } : b)))
    } else if (boxResizeRef.current) {
      // re-derive the fixed opposite edge from current state each frame
      // (rather than a frozen start snapshot) — self-consistent because
      // every previous frame already preserved that same opposite edge
      const { id, corner } = boxResizeRef.current
      const MIN = 60
      const mx = ev.clientX - rect.left
      const my = ev.clientY - rect.top
      setCategoryBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b
          const right = b.pos_x + b.width
          const bottom = b.pos_y + b.height
          let left = b.pos_x
          let top = b.pos_y
          let newRight = right
          let newBottom = bottom
          if (corner === 'nw') {
            left = Math.min(mx, right - MIN)
            top = Math.min(my, bottom - MIN)
          } else if (corner === 'ne') {
            newRight = Math.max(mx, left + MIN)
            top = Math.min(my, bottom - MIN)
          } else if (corner === 'sw') {
            left = Math.min(mx, right - MIN)
            newBottom = Math.max(my, top + MIN)
          } else {
            newRight = Math.max(mx, left + MIN)
            newBottom = Math.max(my, top + MIN)
          }
          return { ...b, pos_x: left, pos_y: top, width: newRight - left, height: newBottom - top }
        })
      )
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
    if (boxDragRef.current || boxResizeRef.current) {
      const id = (boxDragRef.current ?? boxResizeRef.current)!.id
      boxDragRef.current = null
      boxResizeRef.current = null
      const b = categoryBoxes.find((x) => x.id === id)
      if (b) await persistBoxRect(id, { pos_x: b.pos_x, pos_y: b.pos_y, width: b.width, height: b.height })
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
            (n) => n.kind === 'action' && x >= n.pos_x && x <= n.pos_x + actionWidth(n) && y >= n.pos_y && y <= n.pos_y + actionHeight(n)
          )
          if (!overAction) {
            const tagId = newId()
            await addNode({ id: tagId, kind: 'tag', label: '新狀態', pos_x: x - 10, pos_y: y - 16 })
            await addEdge(fromId, tagId)
          }
        }
      } else {
        const targetAction = nodes.find(
          (n) => n.kind === 'action' && x >= n.pos_x && x <= n.pos_x + actionWidth(n) && y >= n.pos_y && y <= n.pos_y + actionHeight(n)
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

  const addNode = async (n: { id: string; kind: 'action' | 'tag'; label: string; pos_x: number; pos_y: number; wait_days?: number }) => {
    setNodes((prev) => [
      ...prev,
      { ...n, wait_days: n.wait_days ?? null, category: null, ...scopeFields, created_at: new Date().toISOString() },
    ])
    await supabase.from('process_nodes').insert({ ...n, ...scopeFields })
  }

  const mapEdgeError = (message: string) =>
    message.includes('wait node can only have one output edge')
      ? '等待節點只能有一個輸出，請先移除原本的輸出連線再重新連接'
      : message.includes('production log history')
        ? '原本的連線已經有生產紀錄，無法自動切換，請先確認舊路徑沒有相關生產紀錄'
        : message

  const addEdge = async (fromNodeId: string, toNodeId: string) => {
    setError(null)
    const id = newId()
    const siblingOrders = edges.filter((e) => e.from_node_id === fromNodeId).map((e) => e.sort_order)
    const sortOrder = siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 0
    const { error: insErr } = await supabase
      .from('process_edges')
      .insert({ id, ...scopeFields, from_node_id: fromNodeId, to_node_id: toNodeId, sort_order: sortOrder })
    if (insErr) {
      setError(mapEdgeError(insErr.message))
      return
    }
    // the exclusivity trigger may have silently dropped older sibling edges
    // on the server — refetch rather than trust the optimistic local diff
    // (silently: load() would flip loading and unmount the canvas, resetting
    // its scroll position back to the top-left every time)
    await fetchAndApply()
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

  const addAction = (pos?: { x: number; y: number }) => {
    addNode({ id: newId(), kind: 'action', label: '新動作', pos_x: pos?.x ?? 40, pos_y: pos?.y ?? 40 })
  }
  const addTag = (pos?: { x: number; y: number }) => {
    addNode({ id: newId(), kind: 'tag', label: '新狀態', pos_x: pos?.x ?? 40, pos_y: pos?.y ?? 400 })
  }
  const addWaitNode = (pos?: { x: number; y: number }) => {
    addNode({ id: newId(), kind: 'action', label: '等待乾燥', pos_x: pos?.x ?? 40, pos_y: pos?.y ?? 220, wait_days: 1 })
  }

  // "複製這個節點" for action/wait nodes — a fresh, unconnected copy so
  // sharing a wait_days setting across several tag pairs doesn't require
  // retyping it (see the decision to keep wait nodes strictly one-in/one-out
  // rather than a shared multi-slot node)
  const uniqueDuplicateLabel = (baseLabel: string): string => {
    const existing = new Set(nodes.map((n) => n.label))
    let i = 1
    let candidate = `${baseLabel}_${i}`
    while (existing.has(candidate)) {
      i++
      candidate = `${baseLabel}_${i}`
    }
    return candidate
  }

  const duplicateNode = (id: string) => {
    const n = findNode(id)
    if (!n || n.kind !== 'action') return
    addNode({
      id: newId(),
      kind: 'action',
      label: uniqueDuplicateLabel(n.label),
      pos_x: n.pos_x + 30,
      pos_y: n.pos_y + 30,
      wait_days: n.wait_days ?? undefined,
    })
  }

  const updateWaitDays = async (id: string, days: number) => {
    const clean = Number.isFinite(days) && days > 0 ? days : 1
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, wait_days: clean } : n)))
    await supabase.from('process_nodes').update({ wait_days: clean }).eq('id', id)
  }

  // 分類虛線框: a draggable/resizable dashed rectangle — whichever tags'
  // positions fall inside it belong to its named category. Deliberately
  // spatial rather than a per-node field, so re-drawing a box never touches
  // (and is never blocked by) the production-log-history protection on
  // process_nodes/process_edges.
  const addCategoryBox = async (pos?: { x: number; y: number }) => {
    const box = {
      id: newId(),
      name: '新分類',
      pos_x: pos?.x ?? 40,
      pos_y: pos?.y ?? 40,
      width: 260,
      height: 180,
      ...scopeFields,
    }
    setCategoryBoxes((prev) => [...prev, { ...box, created_at: new Date().toISOString() }])
    await supabase.from('category_boxes').insert(box)
  }

  const renameCategoryBox = async (id: string, name: string) => {
    const clean = name.trim() || '新分類'
    setCategoryBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, name: clean } : b)))
    await supabase.from('category_boxes').update({ name: clean }).eq('id', id)
  }

  const persistBoxRect = async (id: string, rect: { pos_x: number; pos_y: number; width: number; height: number }) => {
    await supabase.from('category_boxes').update(rect).eq('id', id)
  }

  const removeCategoryBox = async (id: string) => {
    setCategoryBoxes((prev) => prev.filter((b) => b.id !== id))
    await supabase.from('category_boxes').delete().eq('id', id)
  }

  // shared by both "清空全部畫布" and "清空畫布-流程部分" — the flow half is
  // still gated by production-log/校正紀錄 history like before; the category
  // half below never is, since 分類虛線框 don't reference logged data at all
  const checkFlowClearGuard = async (): Promise<boolean> => {
    if (scope.type !== 'product') return true
    const [{ count: logCount }, { count: adjustmentCount }] = await Promise.all([
      supabase.from('production_logs').select('id', { count: 'exact', head: true }).eq('product_id', scope.id),
      supabase.from('stock_adjustments').select('id', { count: 'exact', head: true }).eq('product_id', scope.id),
    ])
    if ((logCount ?? 0) > 0) {
      window.alert('這個產品已經有生產紀錄，無法清空流程。')
      return false
    }
    if ((adjustmentCount ?? 0) > 0) {
      window.alert('這個產品還有校正紀錄，無法清空流程。')
      return false
    }
    return true
  }

  const deleteFlowNodes = async (): Promise<boolean> => {
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
        return false
      }
    }
    if (scope.type === 'product') {
      // the graph no longer matches whatever templates were applied before —
      // clear that history so it doesn't claim a stale provenance
      await supabase.from('product_template_applications').delete().eq('product_id', scope.id)
    }
    setNodes((prev) => prev.filter((n) => n.id === startNode?.id))
    setEdges([])
    return true
  }

  const deleteAllCategoryBoxes = async (): Promise<boolean> => {
    if (categoryBoxes.length === 0) return true
    const { error } = await supabase.from('category_boxes').delete().eq(scopeCol, scope.id)
    if (error) {
      setError('清空分類失敗：' + error.message)
      return false
    }
    setCategoryBoxes([])
    return true
  }

  // once any product has applied this template, its flow is treated like a
  // shared reference — wiping/renaming the flow underneath them would leave
  // those products' "套用過的範本" provenance pointing at something
  // unrecognizable. 分類虛線框 are exempt on purpose: they're meant to be
  // freely re-drawn and re-synced (see 套用分類到多個產品), unlike the flow
  // itself which products can only ever additively diff against.
  const templateHasApplications = async (): Promise<boolean> => {
    if (scope.type !== 'template') return false
    const { count } = await supabase
      .from('product_template_applications')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', scope.id)
    return (count ?? 0) > 0
  }

  const clearAllCanvas = async () => {
    setError(null)
    if (await templateHasApplications()) {
      window.alert('此範本已有產品套用，禁止清空全部畫布！')
      return
    }
    if (!(await checkFlowClearGuard())) return
    if (!window.confirm('確定要清空全部畫布嗎？流程與分類虛線框都會被清空，只留下「開始」，此動作無法復原。')) return
    if (!(await deleteFlowNodes())) return
    await deleteAllCategoryBoxes()
    onChanged?.()
  }

  const clearFlowOnly = async () => {
    setError(null)
    if (await templateHasApplications()) {
      window.alert('此範本已有產品套用，禁止清空流程畫布！')
      return
    }
    if (!(await checkFlowClearGuard())) return
    if (!window.confirm('確定要清空畫布的流程部分嗎？除了「開始」以外的節點都會被刪除（分類虛線框不受影響），此動作無法復原。')) return
    if (!(await deleteFlowNodes())) return
    onChanged?.()
  }

  const clearCategoriesOnly = async () => {
    setError(null)
    if (categoryBoxes.length === 0) return
    if (!window.confirm('確定要清空所有分類虛線框嗎？流程節點不受影響，此動作無法復原。')) return
    await deleteAllCategoryBoxes()
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  const actionNodes = nodes.filter((n) => n.kind === 'action')
  const tagNodes = nodes.filter((n) => n.kind === 'tag')

  return (
    <div>
      {editBlockedByDevice && (
        <p className="text-red-600 text-sm mb-2 font-medium">
          偵測裝置並未有滑鼠支持精確輸入，暫時停止編輯功能
        </p>
      )}
      {editable && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={clearAllCanvas} className="border rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              清空全部畫布
            </button>
            <button onClick={clearFlowOnly} className="border rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              清空畫布－流程部分
            </button>
            <button onClick={clearCategoriesOnly} className="border rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
              清空畫布－分類部分
            </button>
            <span className="text-xs text-gray-400">在畫布上按右鍵可新增節點</span>
          </div>
          {toolbarExtra}
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
            // 'none' is required while actually dragging nodes/connections
            // with a mouse; on a touch-only device (view-only here) it must
            // stay 'auto' or the browser's native pan/scroll gestures break
            touchAction: editable ? 'none' : 'auto',
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => {
            setContextMenu(null)
            setNodeContextMenu(null)
          }}
          onContextMenu={(ev) => {
            if (!editable) return
            ev.preventDefault()
            const rect = canvasRef.current!.getBoundingClientRect()
            setNodeContextMenu(null)
            setContextMenu({ x: ev.clientX - rect.left, y: ev.clientY - rect.top })
          }}
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

          {categoryBoxes.map((b) => (
            <div
              key={b.id}
              className="absolute border-2 border-dashed rounded-md"
              style={{ left: b.pos_x, top: b.pos_y, width: b.width, height: b.height, borderColor: '#9CA3AF', pointerEvents: 'none' }}
            >
              <div
                className="absolute bg-white px-1.5 text-[11px] text-gray-500 whitespace-nowrap"
                style={{ top: -10, left: '50%', transform: 'translateX(-50%)', pointerEvents: editable ? 'auto' : 'none' }}
              >
                {editable ? (
                  <span
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(ev) => renameCategoryBox(b.id, ev.currentTarget.innerText)}
                    className="outline-none"
                  >
                    {b.name}
                  </span>
                ) : (
                  b.name
                )}
              </div>

              {editable && (
                <>
                  <div
                    className="absolute inset-x-2 top-0 h-2 cursor-move"
                    style={{ pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxDrag(ev, b)}
                  />
                  <div
                    className="absolute inset-x-2 bottom-0 h-2 cursor-move"
                    style={{ pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxDrag(ev, b)}
                  />
                  <div
                    className="absolute inset-y-2 left-0 w-2 cursor-move"
                    style={{ pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxDrag(ev, b)}
                  />
                  <div
                    className="absolute inset-y-2 right-0 w-2 cursor-move"
                    style={{ pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxDrag(ev, b)}
                  />
                  <div
                    className="absolute w-3 h-3 bg-white border-2 rounded-sm cursor-nwse-resize"
                    style={{ left: -6, top: -6, borderColor: '#9CA3AF', pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxResize(ev, b, 'nw')}
                  />
                  <div
                    className="absolute w-3 h-3 bg-white border-2 rounded-sm cursor-nesw-resize"
                    style={{ right: -6, top: -6, borderColor: '#9CA3AF', pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxResize(ev, b, 'ne')}
                  />
                  <div
                    className="absolute w-3 h-3 bg-white border-2 rounded-sm cursor-nesw-resize"
                    style={{ left: -6, bottom: -6, borderColor: '#9CA3AF', pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxResize(ev, b, 'sw')}
                  />
                  <div
                    className="absolute w-3 h-3 bg-white border-2 rounded-sm cursor-nwse-resize"
                    style={{ right: -6, bottom: -6, borderColor: '#9CA3AF', pointerEvents: 'auto' }}
                    onPointerDown={(ev) => startBoxResize(ev, b, 'se')}
                  />
                  <button
                    onClick={() => removeCategoryBox(b.id)}
                    className="absolute w-4 h-4 rounded-full bg-white border text-[10px] text-gray-400 hover:text-red-600 flex items-center justify-center"
                    style={{ top: -10, right: -10, pointerEvents: 'auto' }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}

          {actionNodes.map((n) => {
            const outs = outEdgesOfAction(n.id)
            return (
              <div
                key={n.id}
                ref={(el) => {
                  if (el) actionCardRefs.current.set(n.id, el)
                  else actionCardRefs.current.delete(n.id)
                }}
                className="absolute bg-white border rounded-lg px-2.5 pt-2 pb-2"
                style={{
                  left: n.pos_x,
                  top: n.pos_y,
                  width: actionWidth(n),
                  borderColor: n.wait_days != null ? '#3E6FA8' : '#C2BAA2',
                  cursor: editable ? 'grab' : 'default',
                }}
                onPointerDown={(ev) => {
                  if ((ev.target as HTMLElement).closest('.pfe-port,button,[contenteditable],input')) return
                  startDrag(ev, n.id)
                }}
                onContextMenu={(ev) => {
                  if (!editable) return
                  ev.preventDefault()
                  ev.stopPropagation()
                  const rect = canvasRef.current!.getBoundingClientRect()
                  setContextMenu(null)
                  setNodeContextMenu({ nodeId: n.id, x: ev.clientX - rect.left, y: ev.clientY - rect.top })
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
                {n.wait_days != null && (
                  <div className="flex items-center gap-1 mt-1 text-[11px]" style={{ color: '#3E6FA8' }}>
                    <span>⏳ 等待</span>
                    {editable ? (
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        defaultValue={n.wait_days}
                        onBlur={(ev) => updateWaitDays(n.id, Number(ev.target.value))}
                        className="w-14 border rounded px-1 py-0 text-[11px]"
                        style={{ borderColor: '#3E6FA8' }}
                      />
                    ) : (
                      <span>{n.wait_days}</span>
                    )}
                    <span>天</span>
                  </div>
                )}
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
                {editable && !(n.wait_days != null && outs.length >= 1) && (
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
              <div key={n.id} className="absolute" style={{ left: n.pos_x, top: n.pos_y }}>
                <div
                  ref={(el) => {
                    if (el) tagPillRefs.current.set(n.id, el)
                    else tagPillRefs.current.delete(n.id)
                  }}
                  className="rounded-full border-[1.5px] px-2.5 py-1.5 flex items-center gap-1.5"
                  style={{
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
              </div>
            )
          })}

          {contextMenu && (
            <div
              className="absolute bg-white border rounded-lg shadow-lg py-1 text-sm z-10"
              style={{ left: contextMenu.x, top: contextMenu.y, borderColor: '#C2BAA2', minWidth: 140 }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <button
                onClick={() => {
                  addAction(contextMenu)
                  setContextMenu(null)
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                ＋ 新增動作站
              </button>
              <button
                onClick={() => {
                  addTag(contextMenu)
                  setContextMenu(null)
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                ＋ 新增標籤
              </button>
              <button
                onClick={() => {
                  addWaitNode(contextMenu)
                  setContextMenu(null)
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                ＋ 新增等待節點
              </button>
              <button
                onClick={() => {
                  addCategoryBox(contextMenu)
                  setContextMenu(null)
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                ＋ 新增分類虛線框
              </button>
            </div>
          )}

          {nodeContextMenu && (
            <div
              className="absolute bg-white border rounded-lg shadow-lg py-1 text-sm z-10"
              style={{ left: nodeContextMenu.x, top: nodeContextMenu.y, borderColor: '#C2BAA2', minWidth: 140 }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <button
                onClick={() => {
                  duplicateNode(nodeContextMenu.nodeId)
                  setNodeContextMenu(null)
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                複製這個節點
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
