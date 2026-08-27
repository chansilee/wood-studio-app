import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { addMonths, formatDateSlash } from '@/shared/lib/date'
import type { Tables } from '@/shared/types/database'

type WageRate = Tables<'member_wage_rates'>
type DraftRow = { id: string; isNew: boolean; effective_date: string; hourly_wage: string }

const DEFAULT_HOURLY_WAGE = '200'

function toDraftRow(r: WageRate): DraftRow {
  return { id: r.id, isNew: false, effective_date: r.effective_date, hourly_wage: String(r.hourly_wage) }
}

let tempIdCounter = 0

export function MemberWageTable({ memberId, hireDate }: { memberId: string; hireDate: string | null }) {
  const [rows, setRows] = useState<WageRate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!hireDate) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('member_wage_rates')
      .select('*')
      .eq('member_id', memberId)
      .order('effective_date', { ascending: true })
    if (error) setError(error.message)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, hireDate])

  if (!hireDate) {
    return <p className="text-sm text-red-600">&lt;無到職日，請先新增到職日&gt;</p>
  }

  const seedRow = (): DraftRow => {
    tempIdCounter += 1
    return { id: `seed-${tempIdCounter}`, isNew: true, effective_date: hireDate, hourly_wage: DEFAULT_HOURLY_WAGE }
  }

  const displayRows = editing ? draft : rows.length > 0 ? rows.map(toDraftRow) : [seedRow()]

  const startEdit = () => {
    setError(null)
    setDraft(rows.length > 0 ? rows.map(toDraftRow) : [seedRow()])
    setEditing(true)
  }

  const discard = () => {
    setError(null)
    setDraft([])
    setEditing(false)
  }

  const addRow = () => {
    tempIdCounter += 1
    const last = draft[draft.length - 1]
    const nextMonth = addMonths(last.effective_date.slice(0, 7), 1)
    setDraft((prev) => [
      ...prev,
      { id: `new-${tempIdCounter}`, isNew: true, effective_date: `${nextMonth}-01`, hourly_wage: '' },
    ])
  }

  const updateRow = (id: string, patch: Partial<DraftRow>) => {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const removeRow = (id: string) => {
    setDraft((prev) => prev.filter((r) => r.id !== id))
  }

  const save = async () => {
    setError(null)
    for (let i = 0; i < draft.length; i++) {
      const r = draft[i]
      const wage = Number(r.hourly_wage)
      if (Number.isNaN(wage) || wage <= 0) {
        setError(`${formatDateSlash(r.effective_date)} 的約定月薪必須是大於 0 的數字`)
        return
      }
      if (i > 0 && r.effective_date <= draft[i - 1].effective_date) {
        setError(`${formatDateSlash(r.effective_date)} 不可早於或等於上一筆生效日`)
        return
      }
    }

    setSaving(true)

    const removedIds = rows.map((r) => r.id).filter((id) => !draft.some((d) => d.id === id))
    if (removedIds.length > 0) {
      const { error: delError } = await supabase.from('member_wage_rates').delete().in('id', removedIds)
      if (delError) {
        setSaving(false)
        setError(delError.message)
        return
      }
    }

    for (const r of draft) {
      const payload = { member_id: memberId, effective_date: r.effective_date, hourly_wage: Number(r.hourly_wage) }
      const { error: saveError } = r.isNew
        ? await supabase.from('member_wage_rates').insert(payload)
        : await supabase.from('member_wage_rates').update(payload).eq('id', r.id)
      if (saveError) {
        setSaving(false)
        setError(saveError.message)
        return
      }
    }
    setSaving(false)
    setEditing(false)
    setDraft([])
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  return (
    <div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1 pr-4">更新時間點</th>
            <th className="py-1 pr-4">約定月薪</th>
            {editing && <th className="py-1"></th>}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r, i) => {
            const prevDate = i > 0 ? displayRows[i - 1].effective_date : undefined
            const minMonth = prevDate ? addMonths(prevDate.slice(0, 7), 1) : undefined
            return (
              <tr key={r.id} className="border-b">
                <td className="py-1 pr-4 whitespace-nowrap">
                  {editing && i > 0 ? (
                    <input
                      type="month"
                      value={r.effective_date.slice(0, 7)}
                      min={minMonth}
                      onChange={(e) => updateRow(r.id, { effective_date: `${e.target.value}-01` })}
                      className="border rounded px-2 py-1"
                    />
                  ) : (
                    formatDateSlash(r.effective_date)
                  )}
                </td>
                <td className="py-1 pr-4">
                  {editing ? (
                    <input
                      type="number"
                      step={1}
                      min={0}
                      value={r.hourly_wage}
                      onChange={(e) => updateRow(r.id, { hourly_wage: e.target.value })}
                      className="border rounded px-2 py-1 w-24"
                    />
                  ) : (
                    r.hourly_wage
                  )}
                  <span className="ml-1 text-gray-500">元/時</span>
                </td>
                {editing && (
                  <td className="py-1">
                    {i > 0 && (
                      <button onClick={() => removeRow(r.id)} className="text-red-600 text-xs underline">
                        刪除
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
          {editing && (
            <tr>
              <td className="py-2" colSpan={3}>
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
  )
}
