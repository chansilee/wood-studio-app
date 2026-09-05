import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

type DiagramGroup = {
  diagramId: string
  diagramName: string
  layerNames: string[] // depth order, starting from the first real sub-SKU layer (skips the tag's own anchor layer)
  paths: { pathId: string; nodeIds: string[]; isDefault: boolean }[] // nodeIds already has the anchor node dropped
  nodeLabel: Record<string, string>
}

/** One 成品 tag's badge — click to expand its available sub-SKU drill-down (or "No sub-SKU" if nothing's enabled yet) */
export function SkuSubSkuBadge({ tagId, label }: { tagId: string; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<DiagramGroup[] | null>(null)

  const toggle = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (groups !== null) return // already loaded once
    setLoading(true)
    const { data: settings } = await supabase
      .from('product_inventory_path_settings')
      .select('path_id, is_default, inventory_diagram_paths(id, diagram_id, node_ids)')
      .eq('product_tag_node_id', tagId)
      .eq('enabled', true)
    type SettingRow = {
      path_id: string
      is_default: boolean
      inventory_diagram_paths: { id: string; diagram_id: string; node_ids: string[] } | null
    }
    const rows = ((settings ?? []) as unknown as SettingRow[]).filter((r) => r.inventory_diagram_paths)

    if (rows.length === 0) {
      setGroups([])
      setLoading(false)
      return
    }

    const byDiagram = new Map<string, { pathId: string; nodeIds: string[]; isDefault: boolean }[]>()
    for (const r of rows) {
      const p = r.inventory_diagram_paths!
      const list = byDiagram.get(p.diagram_id) ?? []
      list.push({ pathId: p.id, nodeIds: p.node_ids.slice(1), isDefault: r.is_default })
      byDiagram.set(p.diagram_id, list)
    }
    const diagramIds = Array.from(byDiagram.keys())
    const [{ data: diagrams }, { data: layers }, { data: nodes }] = await Promise.all([
      supabase.from('inventory_diagrams').select('id, name').in('id', diagramIds),
      supabase.from('inventory_diagram_layers').select('id, diagram_id, name, depth').in('diagram_id', diagramIds).order('depth'),
      supabase
        .from('inventory_diagram_nodes')
        .select('id, label, layer_id, inventory_diagram_layers!inner(diagram_id)')
        .in('inventory_diagram_layers.diagram_id', diagramIds),
    ])
    const nodeRows = (nodes as unknown as { id: string; label: string }[] | null) ?? []
    const nodeLabel: Record<string, string> = Object.fromEntries(nodeRows.map((n) => [n.id, n.label]))

    const result: DiagramGroup[] = diagramIds.map((diagramId) => {
      const layerNames = (layers ?? [])
        .filter((l) => l.diagram_id === diagramId && l.depth > 1)
        .sort((a, b) => a.depth - b.depth)
        .map((l) => l.name)
      return {
        diagramId,
        diagramName: (diagrams ?? []).find((d) => d.id === diagramId)?.name ?? '未知分類',
        layerNames,
        paths: byDiagram.get(diagramId) ?? [],
        nodeLabel,
      }
    })
    setGroups(result)
    setLoading(false)
  }

  return (
    <div className="inline-block align-top">
      <button
        onClick={toggle}
        className={`text-[11px] rounded px-1.5 py-0.5 border ${
          expanded ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}
      >
        {label}
      </button>
      {expanded && (
        <div className="mt-1 mb-2 border rounded-lg bg-gray-50 p-3 max-w-md">
          {loading ? (
            <p className="text-xs text-gray-400">載入中…</p>
          ) : !groups || groups.length === 0 ? (
            <span className="inline-block text-xs bg-gray-100 text-gray-500 border border-gray-200 rounded-full px-3 py-1">
              No sub-SKU
            </span>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <DiagramDrilldown key={g.diagramId} group={g} showDiagramName={groups!.length > 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DiagramDrilldown({ group, showDiagramName }: { group: DiagramGroup; showDiagramName: boolean }) {
  const [selections, setSelections] = useState<string[]>([])

  const pick = (depth: number, nodeId: string) => {
    setSelections((prev) => [...prev.slice(0, depth), nodeId])
  }

  const levels: { layerName: string; depth: number; options: string[] }[] = []
  for (let depth = 0; depth < group.layerNames.length; depth++) {
    const matching = group.paths.filter((p) => selections.every((sel, i) => p.nodeIds[i] === sel))
    if (matching.length === 0) break
    const options = Array.from(new Set(matching.map((p) => p.nodeIds[depth]).filter(Boolean)))
    if (options.length === 0) break
    levels.push({ layerName: group.layerNames[depth], depth, options })
    if (selections[depth] === undefined) break // stop revealing further levels until this one is chosen
  }

  const fullySelected = selections.length === group.layerNames.length
  const matchedPath = fullySelected ? group.paths.find((p) => p.nodeIds.every((id, i) => id === selections[i])) : null

  return (
    <div>
      {showDiagramName && <p className="text-[11px] font-medium text-gray-500 mb-1.5">{group.diagramName}</p>}
      <div className="space-y-2">
        {levels.map((lvl) => (
          <div key={lvl.depth}>
            <p className="text-[11px] text-gray-400 mb-1">
              sub-SKUs [{lvl.depth + 1}]：{lvl.layerName}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {lvl.options.map((nodeId) => (
                <button
                  key={nodeId}
                  onClick={() => pick(lvl.depth, nodeId)}
                  className={`text-[11px] rounded-full px-2.5 py-1 border ${
                    selections[lvl.depth] === nodeId
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  {group.nodeLabel[nodeId] ?? '?'}
                </button>
              ))}
            </div>
          </div>
        ))}
        {matchedPath && (
          <p className="text-[11px] text-emerald-700">
            {matchedPath.isDefault ? '（這是這個成品的預設分類）' : '（已啟用的品項）'}
          </p>
        )}
      </div>
    </div>
  )
}
