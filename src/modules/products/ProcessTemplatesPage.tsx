import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Tables } from '@/shared/types/database'

type ProcessTemplate = Tables<'process_templates'>

export function ProcessTemplatesPage() {
  const { profile } = useAuth()
  const [templates, setTemplates] = useState<ProcessTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('process_templates').select('*').order('name')
    if (error) setError(error.message)
    setTemplates(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const submitAdd = async () => {
    if (!newName.trim()) {
      setError('請填寫流程名稱')
      return
    }
    setError(null)
    const { error } = await supabase
      .from('process_templates')
      .insert({ name: newName.trim(), created_by: profile?.id })
    if (error) {
      setError(
        error.message.includes('duplicate key') || error.message.includes('unique')
          ? '已經有同名的流程範本了，請換一個名稱'
          : error.message
      )
      return
    }
    setNewName('')
    setAdding(false)
    load()
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h1 className="text-xl font-semibold">編輯生產流程</h1>
        <Link to="/products" className="text-xs text-blue-700 underline">
          ← 返回產品參考
        </Link>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        這裡管理可重複套用的生產流程範本。套用到某個產品時會複製一份獨立的流程，之後編輯範本不會影響已套用的產品。
      </p>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {loading ? (
        <div>載入中…</div>
      ) : (
        <div className="border rounded-lg divide-y">
          {templates.map((t) => (
            <Link
              key={t.id}
              to={`/process-templates/${t.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-xs text-gray-400">編輯 →</span>
            </Link>
          ))}
          {templates.length === 0 && !adding && (
            <p className="px-4 py-3 text-sm text-gray-400">尚無流程範本</p>
          )}
          <div className="px-4 py-3">
            {adding ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="流程名稱，例如：木雕小柴生產流程"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
                  className="border rounded px-2 py-1.5 text-sm flex-1 min-w-[200px]"
                />
                <button onClick={submitAdd} className="bg-black text-white rounded px-3 py-1.5 text-sm">
                  建立
                </button>
                <button
                  onClick={() => {
                    setAdding(false)
                    setNewName('')
                  }}
                  className="border rounded px-3 py-1.5 text-sm hover:bg-gray-100"
                >
                  取消
                </button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="text-sm text-gray-500 hover:text-black">
                ＋ 新增流程
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
