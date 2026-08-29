import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { ProcessFlowEditor } from './ProcessFlowEditor'
import type { Tables } from '@/shared/types/database'

type ProcessTemplate = Tables<'process_templates'>

export function ProcessTemplateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [template, setTemplate] = useState<ProcessTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('process_templates').select('*').eq('id', id).single()
    setTemplate(data ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const rename = async (name: string) => {
    if (!id || !name.trim() || name === template?.name) return
    const { error } = await supabase.from('process_templates').update({ name: name.trim() }).eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setTemplate((prev) => (prev ? { ...prev, name: name.trim() } : prev))
  }

  const removeTemplate = async () => {
    if (!id) return
    const { error } = await supabase.from('process_templates').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/process-templates')
  }

  if (loading) return <div className="p-6">載入中…</div>
  if (!template) return <div className="p-6">找不到這個流程範本</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Link to="/process-templates" className="text-xs text-blue-700 underline">
          ← 返回生產流程列表
        </Link>
        <button onClick={removeTemplate} className="text-red-600 text-xs underline">
          刪除範本
        </button>
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

      <ProcessFlowEditor scope={{ type: 'template', id: template.id }} editable={true} />
    </div>
  )
}
