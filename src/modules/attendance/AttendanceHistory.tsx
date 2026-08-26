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

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

    const [{ data }, { data: profileRow }, { data: leaveRows }] = await Promise.all([
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
    ])

    setRows(data ?? [])
    setDefaultDailyHours(Number(profileRow?.default_daily_hours ?? 6))

    const lMap: Record<string, LeaveJoinRow> = {}
    for (const r of (leaveRows ?? []) as LeaveJoinRow[]) lMap[r.leave_date] = r
    setLeaveMap(lMap)

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

  return (
    <div>
      <h2 className="font-medium mb-2">當月結算：</h2>
      <p className="text-xs text-gray-500 mb-2">紀錄於隔天結算，今日打卡尚未顯示於下表</p>
      {loading ? (
        <div>載入中…</div>
      ) : rows.length === 0 ? (
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
              {rows.map((r) => {
                const { label, colorClass, hoursLabel } = displayFor(r)
                return (
                  <tr key={r.work_date} className="border-b">
                    <td className="py-1 pr-4">{r.work_date}</td>
                    <td className="py-1 pr-4">{formatTime(r.clock_in_at)}</td>
                    <td className="py-1 pr-4">{formatTime(r.clock_out_at)}</td>
                    <td className="py-1 pr-4">{hoursLabel}</td>
                    <td className="py-1 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs ${colorClass}`}>{label}</span>
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
