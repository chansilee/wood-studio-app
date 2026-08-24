import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { daysInMonth, pad2, todayStr } from '@/shared/lib/date'
import type { Tables } from '@/shared/types/database'

type SummaryRow = Tables<'attendance_summary'>

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function AttendanceHistory({
  memberId,
  refreshKey,
}: {
  memberId: string
  refreshKey: number
}) {
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [rows, setRows] = useState<SummaryRow[]>([])
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
    const { data } = await supabase
      .from('attendance_summary')
      .select('*')
      .eq('member_id', memberId)
      .gte('work_date', firstDay)
      .lte('work_date', lastDay)
      .lt('work_date', today)
      .order('work_date', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm text-gray-600">月份</label>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="border rounded px-2 py-1"
        />
      </div>
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
              {rows.map((r) => (
                <tr key={r.work_date} className="border-b">
                  <td className="py-1 pr-4">{r.work_date}</td>
                  <td className="py-1 pr-4">{formatTime(r.clock_in_at)}</td>
                  <td className="py-1 pr-4">{formatTime(r.clock_out_at)}</td>
                  <td className="py-1 pr-4">{r.worked_hours ?? '—'}</td>
                  <td className="py-1 pr-4">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        r.attendance_status === 'normal'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {r.attendance_status === 'normal' ? '正常出勤' : '異常出勤'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
