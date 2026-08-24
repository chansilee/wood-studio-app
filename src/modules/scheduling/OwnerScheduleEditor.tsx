import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthCalendarGrid, type DayCell } from './MonthCalendarGrid'
import { Legend } from './Legend'
import { daysInMonth, pad2, todayStr } from '@/shared/lib/date'
import type { Enums, Tables } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>
type Profile = Tables<'profiles'>

const STATUS_CYCLE: ShiftStatus[] = ['unscheduled', 'normal', 'regular_off', 'special_off']

export function OwnerScheduleEditor() {
  const { session, profile } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [localStatus, setLocalStatus] = useState<Record<string, ShiftStatus>>({})
  const [overridesMap, setOverridesMap] = useState<Record<string, string>>({})
  const [updaterCaption, setUpdaterCaption] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [year, month] = yearMonth.split('-').map(Number)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .neq('role', 'guest')
      .order('display_name')
      .then(({ data }) => {
        setMembers(data ?? [])
        setSelectedMemberId((prev) => prev || profile?.id || data?.[0]?.id || '')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedMemberId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, yearMonth])

  const load = async () => {
    setLoading(true)
    setMessage(null)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

    const [{ data: scheduleRows }, { data: overrideRows }] = await Promise.all([
      supabase
        .from('schedules')
        .select('work_date, status, updated_by')
        .eq('member_id', selectedMemberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('calendar_overrides')
        .select('override_date, name')
        .gte('override_date', firstDay)
        .lte('override_date', lastDay),
    ])

    const overrides: Record<string, string> = {}
    for (const o of overrideRows ?? []) overrides[o.override_date] = o.name
    setOverridesMap(overrides)

    const statusMap: Record<string, ShiftStatus> = {}
    const updaterIds = new Set<string>()
    for (const row of scheduleRows ?? []) {
      statusMap[row.work_date] = row.status
      if (row.updated_by) updaterIds.add(row.updated_by)
    }
    setLocalStatus(statusMap)

    if (updaterIds.size > 0) {
      const { data: updaters } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', Array.from(updaterIds))
      const names = Object.fromEntries((updaters ?? []).map((u) => [u.id, u.display_name]))
      const captions: Record<string, string> = {}
      for (const row of scheduleRows ?? []) {
        if (row.updated_by) captions[row.work_date] = `由 ${names[row.updated_by] ?? '未知'} 更新`
      }
      setUpdaterCaption(captions)
    } else {
      setUpdaterCaption({})
    }

    setLoading(false)
  }

  const cycleStatus = (date: string) => {
    if (overridesMap[date]) return
    setLocalStatus((prev) => {
      const current = prev[date] ?? 'unscheduled'
      const idx = STATUS_CYCLE.indexOf(current)
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
      return { ...prev, [date]: next }
    })
  }

  const handleSave = async () => {
    if (!session || !selectedMemberId) return
    setSaving(true)
    setMessage(null)
    const rows = Object.entries(localStatus)
      .filter(([date]) => !overridesMap[date])
      .map(([work_date, status]) => ({
        member_id: selectedMemberId,
        work_date,
        status,
        created_by: session.user.id,
        updated_by: session.user.id,
      }))
    const { error } = await supabase
      .from('schedules')
      .upsert(rows, { onConflict: 'member_id,work_date' })
    setSaving(false)
    if (error) {
      setMessage(`儲存失敗：${error.message}`)
      return
    }
    setMessage('已儲存並公告，該成員登入後即可在自己的排班頁看到最新結果')
    load()
  }

  const selectedMember = members.find((m) => m.id === selectedMemberId)

  const cells: Record<string, DayCell> = {}
  for (const [date, status] of Object.entries(localStatus)) {
    cells[date] = { status, caption: updaterCaption[date] }
  }
  for (const [date, name] of Object.entries(overridesMap)) {
    cells[date] = { status: 'unscheduled', overrideName: name }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">成員</label>
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="border rounded px-2 py-1"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.id === profile?.id ? '（我）' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">月份</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
        {selectedMember && (
          <div className="text-sm text-gray-600">
            約定每日工時：{selectedMember.default_daily_hours} 小時
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="ml-auto bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {saving ? '儲存中…' : '儲存並公告'}
        </button>
      </div>

      {message && <p className="text-sm mb-3 text-green-700">{message}</p>}

      {loading ? (
        <div>載入中…</div>
      ) : (
        <>
          <Legend />
          <p className="text-xs text-gray-500 mb-2">
            點擊日期可切換班別狀態：未排班 → 正常班 → 例假 → 休假 → 未排班…
          </p>
          <MonthCalendarGrid year={year} month={month} cells={cells} onDayClick={cycleStatus} />
        </>
      )}
    </div>
  )
}
