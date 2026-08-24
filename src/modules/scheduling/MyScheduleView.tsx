import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthCalendarGrid, type DayCell } from './MonthCalendarGrid'
import { Legend } from './Legend'
import { daysInMonth, pad2, todayStr } from '@/shared/lib/date'

export function MyScheduleView() {
  const { profile } = useAuth()
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [cells, setCells] = useState<Record<string, DayCell>>({})
  const [loading, setLoading] = useState(true)

  const [year, month] = yearMonth.split('-').map(Number)

  useEffect(() => {
    if (!profile) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, yearMonth])

  const load = async () => {
    setLoading(true)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

    const [{ data: scheduleRows }, { data: overrideRows }] = await Promise.all([
      supabase
        .from('schedules')
        .select('work_date, status, updated_by')
        .eq('member_id', profile!.id)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('calendar_overrides')
        .select('override_date, name')
        .gte('override_date', firstDay)
        .lte('override_date', lastDay),
    ])

    const updaterIds = Array.from(
      new Set((scheduleRows ?? []).map((r) => r.updated_by).filter((id): id is string => !!id))
    )
    let updaterNames: Record<string, string> = {}
    if (updaterIds.length > 0) {
      const { data: updaters } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', updaterIds)
      updaterNames = Object.fromEntries((updaters ?? []).map((u) => [u.id, u.display_name]))
    }

    const nextCells: Record<string, DayCell> = {}
    for (const row of scheduleRows ?? []) {
      nextCells[row.work_date] = {
        status: row.status,
        caption: row.updated_by ? `由 ${updaterNames[row.updated_by] ?? '未知'} 更新` : undefined,
      }
    }
    for (const o of overrideRows ?? []) {
      nextCells[o.override_date] = { status: 'unscheduled', overrideName: o.name }
    }
    setCells(nextCells)
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">月份</label>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="border rounded px-2 py-1"
        />
      </div>
      {loading ? (
        <div>載入中…</div>
      ) : (
        <>
          <Legend />
          <MonthCalendarGrid year={year} month={month} cells={cells} />
        </>
      )}
    </div>
  )
}
