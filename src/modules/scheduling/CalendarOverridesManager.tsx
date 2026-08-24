import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { CALENDAR_OVERRIDE_LABELS } from '@/shared/constants/roles'
import type { Enums, Tables } from '@/shared/types/database'

type OverrideType = Enums<'calendar_override_type'>
type Override = Tables<'calendar_overrides'>

const TYPE_OPTIONS: OverrideType[] = ['national_holiday', 'disaster_leave', 'election_leave', 'other']

export function CalendarOverridesManager() {
  const [overrides, setOverrides] = useState<Override[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newDate, setNewDate] = useState('')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<OverrideType>('national_holiday')

  const [bulkText, setBulkText] = useState('')
  const [importing, setImporting] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('calendar_overrides').select('*').order('override_date')
    if (error) setError(error.message)
    setOverrides(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const addOne = async () => {
    if (!newDate || !newName) return
    setError(null)
    const { error } = await supabase
      .from('calendar_overrides')
      .insert({ override_date: newDate, name: newName, type: newType })
    if (error) {
      setError(error.message)
      return
    }
    setNewDate('')
    setNewName('')
    load()
  }

  const removeOne = async (id: string) => {
    setError(null)
    const { error } = await supabase.from('calendar_overrides').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  const importBulk = async () => {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const rows: { override_date: string; name: string; type: OverrideType }[] = []
    const badLines: string[] = []
    for (const line of lines) {
      const [date, name] = line.split(/[,\t]/).map((p) => p.trim())
      if (!date || !name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        badLines.push(line)
        continue
      }
      rows.push({ override_date: date, name, type: 'national_holiday' })
    }
    if (rows.length === 0) {
      setError('沒有可匯入的資料，格式請用「YYYY-MM-DD,假日名稱」，一行一筆')
      return
    }
    setImporting(true)
    setError(null)
    const { error } = await supabase.from('calendar_overrides').upsert(rows, { onConflict: 'override_date' })
    setImporting(false)
    if (error) {
      setError(error.message)
      return
    }
    setError(badLines.length > 0 ? `已匯入 ${rows.length} 筆，但有 ${badLines.length} 行格式錯誤被略過` : null)
    setBulkText('')
    load()
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-medium mb-2">新增單筆（國定假日 / 天災假 / 選舉假）</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">日期</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">名稱</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="例如：中秋節、0721 颱風假"
              className="border rounded px-2 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">類型</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as OverrideType)}
              className="border rounded px-2 py-1"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {CALENDAR_OVERRIDE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <button onClick={addOne} className="bg-black text-white rounded px-4 py-1.5 text-sm">
            新增
          </button>
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">批次匯入國定假日</h2>
        <p className="text-xs text-gray-500 mb-2">
          每行一筆，格式：YYYY-MM-DD,假日名稱（例如貼上政府公告的行事曆）
        </p>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          rows={5}
          className="w-full border rounded px-2 py-1 font-mono text-sm"
          placeholder={'2027-01-01,元旦\n2027-02-17,農曆除夕'}
        />
        <button
          onClick={importBulk}
          disabled={importing}
          className="mt-2 bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
        >
          {importing ? '匯入中…' : '批次匯入'}
        </button>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="font-medium mb-2">目前清單</h2>
        {loading ? (
          <div>載入中…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-4">日期</th>
                  <th className="py-1 pr-4">名稱</th>
                  <th className="py-1 pr-4">類型</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id} className="border-b">
                    <td className="py-1 pr-4">{o.override_date}</td>
                    <td className="py-1 pr-4">{o.name}</td>
                    <td className="py-1 pr-4">{CALENDAR_OVERRIDE_LABELS[o.type]}</td>
                    <td className="py-1">
                      <button onClick={() => removeOne(o.id)} className="text-red-600 text-xs underline">
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
