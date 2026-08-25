import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthCalendarGrid, type DayCell } from './MonthCalendarGrid'
import { Legend } from './Legend'
import { PublicationBar } from './PublicationBar'
import { useSchedulePublications, type PublicationSnapshotEntry } from './usePublications'
import { useWeekStart } from './useWeekStart'
import { checkWeeklyRestCompliance, daysInMonth, pad2, todayStr } from '@/shared/lib/date'
import type { Enums } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>

export function MyScheduleView() {
  const { profile } = useAuth()
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [liveStatus, setLiveStatus] = useState<Record<string, ShiftStatus>>({})
  const [overridesMap, setOverridesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | 'live'>('live')

  const [year, month] = yearMonth.split('-').map(Number)
  const { publications } = useSchedulePublications(profile?.id, yearMonth)
  const { weekStartWeekday } = useWeekStart(profile?.id, yearMonth, profile?.hire_date)

  useEffect(() => {
    if (!profile) return
    setViewingId('live')
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
        .select('work_date, status')
        .eq('member_id', profile!.id)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('calendar_overrides')
        .select('override_date, name')
        .gte('override_date', firstDay)
        .lte('override_date', lastDay),
    ])

    const statusMap: Record<string, ShiftStatus> = {}
    for (const row of scheduleRows ?? []) statusMap[row.work_date] = row.status
    setLiveStatus(statusMap)

    const overrides: Record<string, string> = {}
    for (const o of overrideRows ?? []) overrides[o.override_date] = o.name
    setOverridesMap(overrides)

    setLoading(false)
  }

  const viewingPublication = viewingId === 'live' ? null : publications.find((p) => p.id === viewingId)
  const displayStatus: Record<string, ShiftStatus> =
    viewingId === 'live'
      ? liveStatus
      : Object.fromEntries(
          ((viewingPublication?.snapshot as PublicationSnapshotEntry[] | null) ?? []).map((e) => [
            e.work_date,
            e.status,
          ])
        )

  const cells: Record<string, DayCell> = {}
  for (const [date, status] of Object.entries(displayStatus)) {
    cells[date] = { status }
  }
  for (const [date, name] of Object.entries(overridesMap)) {
    cells[date] = { status: 'unscheduled', overrideName: name }
  }

  const showWeekStart = !!profile?.hire_date && !!profile?.weekly_rest_check_enabled
  const isCompliant = checkWeeklyRestCompliance(year, month, weekStartWeekday, displayStatus)

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
          <PublicationBar publications={publications} viewingId={viewingId} onChange={setViewingId} />
          <Legend />
          <MonthCalendarGrid
            year={year}
            month={month}
            cells={cells}
            weekStartWeekday={showWeekStart ? weekStartWeekday : undefined}
          />
          {showWeekStart && (
            <p className={`text-sm mt-2 ${isCompliant ? 'text-green-700' : 'text-red-600 font-medium'}`}>
              {isCompliant ? '本月符合一例一休！' : '本月有完整周缺失一例一休，請檢查！'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
