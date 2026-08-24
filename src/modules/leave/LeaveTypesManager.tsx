import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { Tables } from '@/shared/types/database'

type LeaveType = Tables<'leave_types'>

export function LeaveTypesManager() {
  const [types, setTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('leave_types').select('*').order('created_at')
    if (error) setError(error.message)
    setTypes(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    if (!newName.trim()) return
    setError(null)
    const { error } = await supabase.from('leave_types').insert({ name: newName.trim() })
    if (error) {
      setError(error.message)
      return
    }
    setNewName('')
    load()
  }

  const remove = async (id: string) => {
    setError(null)
    const { error } = await supabase.from('leave_types').delete().eq('id', id)
    if (error) {
      setError(
        error.message.includes('foreign key')
          ? '無法刪除：已有請假紀錄使用此假別'
          : error.message
      )
      return
    }
    load()
  }

  return (
    <div>
      <h2 className="font-medium mb-2">假別管理</h2>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新增假別名稱，例如：育嬰假"
          className="border rounded px-2 py-1 flex-1 max-w-xs"
        />
        <button onClick={add} className="bg-black text-white rounded px-4 py-1.5 text-sm">
          新增
        </button>
      </div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {loading ? (
        <div>載入中…</div>
      ) : (
        <ul className="max-w-xs divide-y border rounded">
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{t.name}</span>
              <button onClick={() => remove(t.id)} className="text-red-600 text-xs underline">
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
