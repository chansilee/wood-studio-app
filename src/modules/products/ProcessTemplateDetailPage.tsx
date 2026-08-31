import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { ProcessFlowEditor } from './ProcessFlowEditor'
import { ApplyTemplateDiffPanel } from './ApplyTemplateDiffPanel'
import type { Tables } from '@/shared/types/database'

type ProcessTemplate = Tables<'process_templates'>

export function ProcessTemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [template, setTemplate] = useState<ProcessTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('process_templates').select('*').eq('id', id).single()
    setTemplate(data ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // switching to a different template (or leaving the page entirely, which
    // unmounts this component) should always re-lock editing
    setUnlocked(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const rename = async (name: string) => {
    var clean = name.trim()
    if (!id || !clean || clean === template?.name) return
    setError(null)
    const { error } = await supabase.from('process_templates').update({ name: clean }).eq('id', id)
    if (error) {
      setError(
        error.message.includes('duplicate key') || error.message.includes('unique')
          ? '已經有同名的流程範本了，請換一個名稱'
          : error.message
      )
      return
    }
    setTemplate((prev) => (prev ? { ...prev, name: clean } : prev))
  }

  const removeTemplate = async () => {
    if (!id) return
    if (!window.confirm(`確定要刪除範本「${template?.name}」嗎？此動作無法復原。`)) return
    const { error } = await supabase.from('process_templates').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/process-templates')
  }

  const duplicateTemplate = async () => {
    if (!id || !template) return
    setError(null)
    const { data: existing } = await supabase.from('process_templates').select('name')
    var existingNames = new Set((existing ?? []).map((t) => t.name))
    // Windows-style copy naming: "X - 複製", then "X - 複製 (2)", "(3)"...
    var base = `${template.name} - 複製`
    var newName = base
    var n = 2
    while (existingNames.has(newName)) {
      newName = `${base} (${n})`
      n++
    }
    const { data: newTemplate, error: createErr } = await supabase
      .from('process_templates')
      .insert({ name: newName })
      .select()
      .single()
    if (createErr || !newTemplate) {
      setError(createErr?.message ?? '複製失敗')
      return
    }
    const [{ data: srcNodes }, { data: srcEdges }] = await Promise.all([
      supabase.from('process_nodes').select('*').eq('template_id', id),
      supabase.from('process_edges').select('*').eq('template_id', id),
    ])
    if (srcNodes && srcNodes.length > 0) {
      var idMap = new Map<string, string>()
      srcNodes.forEach((nd) => idMap.set(nd.id, crypto.randomUUID()))
      const newNodes = srcNodes.map((nd) => ({
        id: idMap.get(nd.id)!,
        kind: nd.kind,
        label: nd.label,
        pos_x: nd.pos_x,
        pos_y: nd.pos_y,
        wait_days: nd.wait_days,
        template_id: newTemplate.id,
      }))
      await supabase.from('process_nodes').insert(newNodes)
      const newEdges = (srcEdges ?? []).map((ed) => ({
        id: crypto.randomUUID(),
        from_node_id: idMap.get(ed.from_node_id)!,
        to_node_id: idMap.get(ed.to_node_id)!,
        template_id: newTemplate.id,
        sort_order: ed.sort_order,
      }))
      if (newEdges.length > 0) await supabase.from('process_edges').insert(newEdges)
    }
    navigate(`/process-templates/${newTemplate.id}`)
  }

  if (loading) return <div className="p-6">載入中…</div>
  if (!template) return <div className="p-6">找不到這個流程範本</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Link to="/process-templates" className="text-xs text-blue-700 underline">
          ← 返回生產流程列表
        </Link>
        <div className="flex items-center gap-3 ml-auto">
          <button onClick={duplicateTemplate} className="text-blue-700 text-xs underline">
            複製範本
          </button>
          <button onClick={removeTemplate} className="text-red-600 text-xs underline">
            刪除範本
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <input
        type="text"
        defaultValue={template.name}
        onBlur={(e) => rename(e.target.value)}
        className="text-xl font-semibold border-none outline-none bg-transparent w-full mb-4"
      />

      <p className="text-xs text-gray-500 mb-3">
        編輯此範本不會影響已套用過的產品；產品套用時會複製一份獨立的流程。
      </p>

      {!unlocked && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-3 mb-2">
          <button
            onClick={() => setUnlocked(true)}
            className="bg-red-600 text-white rounded px-4 py-1.5 text-sm mb-2 hover:bg-red-700"
          >
            解除鎖定
          </button>
          <p className="text-xs text-red-700">
            解除鎖定後，您將直接可以修改下面流程，任何修改都會立即存回範本。若您想保留原始設定，請善用「複製範本」備份。
          </p>
        </div>
      )}

      <ProcessFlowEditor
        scope={{ type: 'template', id: template.id }}
        editable={unlocked}
        toolbarExtra={
          unlocked ? (
            <button
              onClick={() => setUnlocked(false)}
              className="border rounded px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              回到鎖定
            </button>
          ) : undefined
        }
      />

      <ApplyTemplateDiffPanel templateId={template.id} templateName={template.name} />
    </div>
  )
}
