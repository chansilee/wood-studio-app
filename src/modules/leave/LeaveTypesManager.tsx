import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { Tables } from '@/shared/types/database'

type LeaveType = Tables<'leave_types'>
type EditRow = {
  id: string
  isNew: boolean
  name: string
  pay_coefficient: string
  description: string
  hidden_from_members: boolean
}

function toEditRow(t: LeaveType): EditRow {
  return {
    id: t.id,
    isNew: false,
    name: t.name,
    pay_coefficient: String(t.pay_coefficient),
    description: t.description,
    hidden_from_members: t.hidden_from_members,
  }
}

let tempIdCounter = 0

export function LeaveTypesManager() {
  const [types, setTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<EditRow[]>([])
  const [saving, setSaving] = useState(false)
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

  const startEdit = () => {
    setError(null)
    setRows(types.map(toEditRow))
    setEditing(true)
  }

  const discard = () => {
    setError(null)
    setRows([])
    setEditing(false)
  }

  const addRow = () => {
    tempIdCounter += 1
    setRows((prev) => [
      ...prev,
      {
        id: `new-${tempIdCounter}`,
        isNew: true,
        name: '',
        pay_coefficient: '1',
        description: '',
        hidden_from_members: false,
      },
    ])
  }

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const updateRow = (id: string, patch: Partial<EditRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const save = async () => {
    setError(null)
    for (const r of rows) {
      if (r.isNew && !r.name.trim()) {
        setError('新增的假別必須填寫名稱')
        return
      }
      if (Number.isNaN(Number(r.pay_coefficient))) {
        setError(`「${r.name}」的給薪係數必須是數字`)
        return
      }
    }

    setSaving(true)

    const removedIds = types.map((t) => t.id).filter((id) => !rows.some((r) => r.id === id))
    if (removedIds.length > 0) {
      const { error: delError } = await supabase.from('leave_types').delete().in('id', removedIds)
      if (delError) {
        setSaving(false)
        setError(
          delError.message.includes('foreign key')
            ? '無法刪除：已有請假紀錄使用此假別'
            : delError.message
        )
        return
      }
    }

    for (const r of rows) {
      const payload = {
        name: r.name.trim(),
        pay_coefficient: Number(r.pay_coefficient),
        description: r.description,
        hidden_from_members: r.hidden_from_members,
      }
      const { error: saveError } = r.isNew
        ? await supabase.from('leave_types').insert(payload)
        : await supabase.from('leave_types').update(payload).eq('id', r.id)
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
    }

    setSaving(false)
    setEditing(false)
    setRows([])
    load()
  }

  const displayRows = editing ? rows : types.map(toEditRow)

  return (
    <div>
      <h2 className="font-medium mb-2">假別管理</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {loading ? (
        <div>載入中…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1 pr-4">假別</th>
                <th className="py-1 pr-4">給薪係數</th>
                <th className="py-1 pr-4">假別說明</th>
                <th className="py-1 pr-4">對使用者隱藏</th>
                {editing && <th className="py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-1 pr-4 whitespace-nowrap">
                    {editing && r.isNew ? (
                      <input
                        type="text"
                        value={r.name}
                        onChange={(e) => updateRow(r.id, { name: e.target.value })}
                        placeholder="假別名稱"
                        className="border rounded px-2 py-1 w-28"
                      />
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className="py-1 pr-4">
                    {editing ? (
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={1}
                        value={r.pay_coefficient}
                        onChange={(e) => updateRow(r.id, { pay_coefficient: e.target.value })}
                        className="border rounded px-2 py-1 w-20"
                      />
                    ) : (
                      r.pay_coefficient
                    )}
                  </td>
                  <td className="py-1 pr-4">
                    {editing ? (
                      <input
                        type="text"
                        value={r.description}
                        onChange={(e) => updateRow(r.id, { description: e.target.value })}
                        className="border rounded px-2 py-1 w-40"
                      />
                    ) : (
                      r.description
                    )}
                  </td>
                  <td className="py-1 pr-4 text-center">
                    <input
                      type="checkbox"
                      checked={r.hidden_from_members}
                      disabled={!editing}
                      onChange={(e) => updateRow(r.id, { hidden_from_members: e.target.checked })}
                    />
                  </td>
                  {editing && (
                    <td className="py-1">
                      <button
                        onClick={() => removeRow(r.id)}
                        className="text-red-600 text-xs underline"
                      >
                        刪除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {editing && (
                <tr>
                  <td className="py-2" colSpan={5}>
                    <button
                      onClick={addRow}
                      className="border rounded w-7 h-7 text-sm text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-3 flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={save}
                  disabled={saving}
                  className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {saving ? '儲存中…' : '儲存'}
                </button>
                <button
                  onClick={discard}
                  disabled={saving}
                  className="bg-white text-gray-700 border border-gray-300 rounded px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  放棄
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                className="bg-white text-gray-700 border border-gray-300 rounded px-4 py-1.5 text-sm hover:bg-gray-50"
              >
                編輯
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
