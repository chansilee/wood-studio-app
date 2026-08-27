import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { daysInMonth, pad2, todayStr } from '@/shared/lib/date'
import { formatHours } from '@/modules/leave/leaveDisplay'
import type { Tables } from '@/shared/types/database'

type SummaryRow = Tables<'attendance_summary'>
type LeaveJoinRow = {
  leave_date: string
  duration_type: string
  hours: number | null
  is_manager_override: boolean
  leave_types: { name: string } | null
}
/** a past day with at least one non-rejected punch, but not yet fully approved so no attendance_summary row exists */
type PendingRow = { work_date: string; clock_in_at: string | null; clock_out_at: string | null }

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Asia/Taipei calendar date for a punch timestamp */
function taipeiDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

export function AttendanceHistory({
  memberId,
  yearMonth,
  refreshKey,
}: {
  memberId: string
  yearMonth: string
  refreshKey: number
}) {
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [pendingRows, setPendingRows] = useState<PendingRow[]>([])
  const [leaveMap, setLeaveMap] = useState<Record<string, LeaveJoinRow>>({})
  const [defaultDailyHours, setDefaultDailyHours] = useState(6)
  const [loading, setLoading] = useState(true)

  const [year, month] = yearMonth.split('-').map(Number)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, yearMonth, refreshKey])

  const load = async () => {
    setLoading(true)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`
    const today = todayStr()

    const firstDayStart = `${firstDay}T00:00:00+08:00`
    const todayStart = `${today}T00:00:00+08:00`

    const [{ data }, { data: profileRow }, { data: leaveRows }, { data: eventRows }] = await Promise.all([
      supabase
        .from('attendance_summary')
        .select('*')
        .eq('member_id', memberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay)
        .lt('work_date', today)
        .order('work_date', { ascending: false }),
      supabase.from('profiles').select('default_daily_hours').eq('id', memberId).single(),
      supabase
        .from('leave_requests')
        .select('leave_date, duration_type, hours, is_manager_override, leave_types(name)')
        .eq('member_id', memberId)
        .eq('status', 'approved')
        .gte('leave_date', firstDay)
        .lte('leave_date', lastDay),
      // any non-rejected punch on a past day, even if not (yet) fully approved —
      // still needs to be visible since the owner may later turn it into 主管同意提早下班
      supabase
        .from('attendance_events')
        .select('event_type, occurred_at, approval_status')
        .eq('member_id', memberId)
        .neq('approval_status', 'rejected')
        .gte('occurred_at', firstDayStart)
        .lt('occurred_at', todayStart)
        .order('occurred_at', { ascending: true }),
    ])

    const summaryRows = data ?? []
    setRows(summaryRows)
    setDefaultDailyHours(Number(profileRow?.default_daily_hours ?? 6))

    const lMap: Record<string, LeaveJoinRow> = {}
    for (const r of (leaveRows ?? []) as LeaveJoinRow[]) lMap[r.leave_date] = r
    setLeaveMap(lMap)

    const settledDates = new Set(summaryRows.map((r) => r.work_date).filter((d): d is string => !!d))
    const pendingMap: Record<string, PendingRow> = {}
    for (const e of eventRows ?? []) {
      const workDate = taipeiDateStr(e.occurred_at)
      if (settledDates.has(workDate)) continue
      pendingMap[workDate] ??= { work_date: workDate, clock_in_at: null, clock_out_at: null }
      if (e.event_type === 'clock_in' && !pendingMap[workDate].clock_in_at) {
        pendingMap[workDate].clock_in_at = e.occurred_at
      }
      if (e.event_type === 'clock_out') {
        pendingMap[workDate].clock_out_at = e.occurred_at
      }
    }
    setPendingRows(Object.values(pendingMap).sort((a, b) => (a.work_date < b.work_date ? 1 : -1)))

    setLoading(false)
  }

  const displayFor = (r: SummaryRow): { label: string; colorClass: string; hoursLabel: string } => {
    const rawHoursLabel = r.worked_hours != null ? formatHours(r.worked_hours) : '—'
    const leave = r.work_date ? leaveMap[r.work_date] : undefined

    if (leave?.is_manager_override) {
      return {
        label: '正常出勤(主管同意提早下班)',
        colorClass: 'bg-green-100 text-green-800',
        hoursLabel: formatHours(defaultDailyHours),
      }
    }

    if (leave) {
      const typeName = leave.leave_types?.name ?? '未知假別'
      if (leave.duration_type === 'full_day') {
        return {
          label: `正常出勤(${typeName} 全天)`,
          colorClass: 'bg-green-100 text-green-800',
          hoursLabel: rawHoursLabel,
        }
      }
      const qualifies = Number(r.worked_hours ?? 0) + Number(leave.hours ?? 0) >= defaultDailyHours
      if (qualifies) {
        return {
          label: `正常出勤(含:${typeName}${formatHours(leave.hours)}小時)`,
          colorClass: 'bg-green-100 text-green-800',
          hoursLabel: rawHoursLabel,
        }
      }
    }

    return {
      label: r.attendance_status === 'normal' ? '正常出勤' : '異常出勤',
      colorClass: r.attendance_status === 'normal' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
      hoursLabel: rawHoursLabel,
    }
  }

  const combinedRows: Array<{ work_date: string; settled?: SummaryRow; pending?: PendingRow }> = [
    ...rows.map((r) => ({ work_date: r.work_date as string, settled: r })),
    ...pendingRows.map((r) => ({ work_date: r.work_date, pending: r })),
  ].sort((a, b) => (a.work_date < b.work_date ? 1 : -1))
  const hasRows = combinedRows.length > 0

  return (
    <div>
      <h2 className="font-medium mb-2">當月結算：</h2>
      <p className="text-xs text-gray-500 mb-2">紀錄於隔天結算，今日打卡尚未顯示於下表</p>
      {loading ? (
        <div>載入中…</div>
      ) : !hasRows ? (
        <p className="text-sm text-gray-400">本月尚無已結算的紀錄</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1 pr-4">日期</th>
                <th className="py-1 pr-4">上班時間</th>
                <th className="py-1 pr-4">下班時間</th>
                <th className="py-1 pr-4">上班時數</th>
                <th className="py-1 pr-4">出勤狀態</th>
              </tr>
            </thead>
            <tbody>
              {combinedRows.map(({ work_date, settled, pending }) => {
                if (settled) {
                  const { label, colorClass, hoursLabel } = displayFor(settled)
                  return (
                    <tr key={work_date} className="border-b">
                      <td className="py-1 pr-4">{work_date}</td>
                      <td className="py-1 pr-4">{formatTime(settled.clock_in_at)}</td>
                      <td className="py-1 pr-4">{formatTime(settled.clock_out_at)}</td>
                      <td className="py-1 pr-4">{hoursLabel}</td>
                      <td className="py-1 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${colorClass}`}>{label}</span>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={work_date} className="border-b">
                    <td className="py-1 pr-4">{work_date}</td>
                    <td className="py-1 pr-4">{formatTime(pending!.clock_in_at)}</td>
                    <td className="py-1 pr-4">{formatTime(pending!.clock_out_at)}</td>
                    <td className="py-1 pr-4">-</td>
                    <td className="py-1 pr-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
                        補登審核中
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
