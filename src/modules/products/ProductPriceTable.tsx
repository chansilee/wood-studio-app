import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { addDays, formatDateSlash } from '@/shared/lib/date'
import type { Tables } from '@/shared/types/database'

type PriceRow = Tables<'product_prices'>
type DraftRow = { id: string; isNew: boolean; effective_date: string; price: string }

function toDraftRow(r: PriceRow): DraftRow {
  return { id: r.id, isNew: false, effective_date: r.effective_date, price: String(r.price) }
}

// created_at is a UTC timestamp; converting via Date's local getters (not a
// raw string slice) avoids the day-boundary bug we've hit before with UTC-
// vs-local timestamp display elsewhere in this app
function localDateStr(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

let tempIdCounter = 0

export function ProductPriceTable({
  productId,
  createdAt,
  editable,
  onChanged,
}: {
  productId: string
  createdAt: string
  editable: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const anchorDate = localDateStr(createdAt)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('product_prices')
      .select('*')
      .eq('product_id', productId)
      .order('effective_date', { ascending: true })
    if (error) setError(error.message)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const seedRow = (): DraftRow => {
    tempIdCounter += 1
    return { id: `seed-${tempIdCounter}`, isNew: true, effective_date: anchorDate, price: '' }
  }

  const displayRows = editing ? draft : rows.length > 0 ? rows.map(toDraftRow) : editable ? [seedRow()] : []

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
    setDraft((prev) => [
      ...prev,
      { id: `new-${tempIdCounter}`, isNew: true, effective_date: addDays(last.effective_date, 1), price: '' },
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
      const price = Number(r.price)
      if (Number.isNaN(price) || price < 0) {
        setError(`${formatDateSlash(r.effective_date)} 的價格必須是不小於 0 的數字`)
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
      const { error: delError } = await supabase.from('product_prices').delete().in('id', removedIds)
      if (delError) {
        setSaving(false)
        setError(delError.message)
        return
      }
    }

    for (const r of draft) {
      const payload = { product_id: productId, effective_date: r.effective_date, price: Number(r.price) }
      const { error: saveError } = r.isNew
        ? await supabase.from('product_prices').insert(payload)
        : await supabase.from('product_prices').update(payload).eq('id', r.id)
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
    onChanged?.()
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  if (displayRows.length === 0) {
    return <p className="text-sm text-gray-400">尚未設定價格</p>
  }

  return (
    <div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <table className="text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1 pr-4">生效日期</th>
            <th className="py-1 pr-4">價格</th>
            {editing && <th className="py-1"></th>}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r, i) => {
            const prevDate = i > 0 ? displayRows[i - 1].effective_date : undefined
            const minDate = prevDate ? addDays(prevDate, 1) : undefined
            return (
              <tr key={r.id} className="border-b">
                <td className="py-1 pr-4 whitespace-nowrap">
                  {editing && i > 0 ? (
                    <input
                      type="date"
                      value={r.effective_date}
                      min={minDate}
                      onChange={(e) => updateRow(r.id, { effective_date: e.target.value })}
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
                      value={r.price}
                      onChange={(e) => updateRow(r.id, { price: e.target.value })}
                      className="border rounded px-2 py-1 w-24"
                    />
                  ) : (
                    r.price
                  )}
                  <span className="ml-1 text-gray-500">元</span>
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
                <button onClick={addRow} className="border rounded w-7 h-7 text-sm text-gray-600 hover:bg-gray-50">
                  +
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {editable && (
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
      )}
    </div>
  )
}
