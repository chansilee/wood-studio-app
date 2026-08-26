import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { useSchedulePublications, type PublicationSnapshotEntry } from '@/modules/scheduling/usePublications'
import { formatHours } from '@/modules/leave/leaveDisplay'
import { daysInMonth, formatDateSlash, pad2, todayStr } from '@/shared/lib/date'
import type { Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>

interface SettlementRow {
  date: string
  rawStatus: 'normal' | 'abnormal'
  rawHours: number
  leaveLabel: string
  leaveTypeName: string | null
  leaveContributedHours: number
  settledHours: number
}

export function MonthlySettlementPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)

  const [year, month] = yearMonth.split('-').map(Number)
  const memberId = isOwner ? selectedMemberId : profile?.id ?? ''
  const { publications } = useSchedulePublications(memberId || undefined, yearMonth)
  const latestSnapshot = publications[0]

  useEffect(() => {
    if (!isOwner || !profile) return
    supabase
      .from('profiles')
      .select('*')
      .in('role', ['owner', 'staff', 'apprentice'])
      .order('display_name')
      .then(({ data }) => {
        setMembers(data ?? [])
        setSelectedMemberId((prev) => prev || profile.id)
      })
  }, [isOwner, profile])

  useEffect(() => {
    if (!memberId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, yearMonth, latestSnapshot])

  const load = async () => {
    setLoading(true)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`
    const today = todayStr()

    const snapshot = (latestSnapshot?.snapshot as PublicationSnapshotEntry[] | undefined) ?? []
    const normalDates = snapshot
      .filter(
        (e) => e.status === 'normal' && e.work_date < today && e.work_date >= firstDay && e.work_date <= lastDay
      )
      .map((e) => e.work_date)
      .sort()

    if (normalDates.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const [{ data: profileRow }, { data: attRows }, { data: leaveRows }] = await Promise.all([
      supabase.from('profiles').select('default_daily_hours').eq('id', memberId).single(),
      supabase
        .from('attendance_summary')
        .select('work_date, attendance_status, worked_hours')
        .eq('member_id', memberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('leave_requests')
        .select('leave_date, duration_type, hours, leave_types(name)')
        .eq('member_id', memberId)
        .eq('status', 'approved')
        .gte('leave_date', firstDay)
        .lte('leave_date', lastDay),
    ])

    const defaultDailyHours = Number(profileRow?.default_daily_hours ?? 6)

    const attMap: Record<string, { status: string; hours: number }> = {}
    for (const r of attRows ?? []) {
      if (r.work_date) {
        attMap[r.work_date] = { status: r.attendance_status ?? 'abnormal', hours: Number(r.worked_hours ?? 0) }
      }
    }

    type LeaveJoinRow = { leave_date: string; duration_type: string; hours: number | null; leave_types: { name: string } | null }
    const leaveMap: Record<string, LeaveJoinRow> = {}
    for (const r of (leaveRows ?? []) as LeaveJoinRow[]) {
      leaveMap[r.leave_date] = r
    }

    const computedRows: SettlementRow[] = normalDates.map((date) => {
      const att = attMap[date]
      const rawStatus: 'normal' | 'abnormal' = att?.status === 'normal' ? 'normal' : 'abnormal'
      const rawHours = att?.hours ?? 0
      const leave = leaveMap[date]

      let leaveLabel = '無'
      let leaveTypeName: string | null = null
      let leaveContributedHours = 0
      if (leave) {
        leaveTypeName = leave.leave_types?.name ?? '未知假別'
        if (leave.duration_type === 'full_day') {
          leaveLabel = `全天${leaveTypeName}`
          leaveContributedHours = defaultDailyHours
        } else {
          const h = Number(leave.hours ?? 0)
          leaveLabel = `${formatHours(h)}小時${leaveTypeName}`
          leaveContributedHours = h
        }
      }

      const requiredRemaining = Math.max(0, defaultDailyHours - leaveContributedHours)
      const settledHours = Math.min(rawHours, requiredRemaining)

      return {
        date,
        rawStatus,
        rawHours,
        leaveLabel,
        leaveTypeName,
        leaveContributedHours,
        settledHours: Math.round(settledHours * 100) / 100,
      }
    })

    setRows(computedRows)
    setLoading(false)
  }

  const totalSettled = useMemo(
    () => Math.round(rows.reduce((sum, r) => sum + r.settledHours, 0) * 100) / 100,
    [rows]
  )
  const leaveTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const r of rows) {
      if (r.leaveTypeName) {
        totals[r.leaveTypeName] = (totals[r.leaveTypeName] ?? 0) + r.leaveContributedHours
      }
    }
    return totals
  }, [rows])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">月結系統</h1>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {isOwner && (
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
        )}
        <div>
          <label className="block text-xs text-gray-600 mb-1">月份</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        以「最新公告」的排班為準，僅列出已結算（隔天才結算）的正常班日期。
      </p>

      {loading ? (
        <div>載入中…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">本月尚無已結算的正常班紀錄</p>
      ) : (
        <>
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-4">日期</th>
                  <th className="py-1 pr-4">原排班狀態</th>
                  <th className="py-1 pr-4">實際出勤狀態</th>
                  <th className="py-1 pr-4">請假加班</th>
                  <th className="py-1 pr-4">規整上班時數</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} className="border-b">
                    <td className="py-1 pr-4 whitespace-nowrap">{formatDateSlash(r.date)}</td>
                    <td className="py-1 pr-4">正常班</td>
                    <td className="py-1 pr-4">
                      {r.rawStatus === 'normal' ? '正常出勤' : '異常出勤'}
                      {formatHours(r.rawHours)}小時
                    </td>
                    <td className="py-1 pr-4">{r.leaveLabel}</td>
                    <td className="py-1 pr-4">{formatHours(r.settledHours)}小時</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t pt-3 text-sm space-y-1">
            <p className="font-medium">{month}月全月總結：</p>
            <p>規整上班時數：{formatHours(totalSettled)}小時</p>
            {Object.entries(leaveTotals).map(([name, hours]) => (
              <p key={name}>
                {name}：{formatHours(hours)}小時
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
