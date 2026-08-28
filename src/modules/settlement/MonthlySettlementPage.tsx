import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { useSchedulePublications, type PublicationSnapshotEntry } from '@/modules/scheduling/usePublications'
import { formatHours } from '@/modules/leave/leaveDisplay'
import { MonthSelector } from '@/shared/components/MonthSelector'
import { SettlementArchive } from './SettlementArchive'
import { SettlementSettings } from './SettlementSettings'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import {
  addMonths,
  daysInMonth,
  defaultSettlementYearMonth,
  formatDateSlash,
  formatDateTime,
  pad2,
  todayStr,
} from '@/shared/lib/date'
import type { Json, Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>
type SettlementSnapshotRow = Tables<'settlement_snapshots'>

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
  const [tab, setTab] = useState<'current' | 'archive' | 'settings'>('current')
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [existingSnapshot, setExistingSnapshot] = useState<SettlementSnapshotRow | null>(null)
  const [producing, setProducing] = useState(false)

  const [year, month] = yearMonth.split('-').map(Number)
  const memberId = isOwner ? selectedMemberId : profile?.id ?? ''
  const { publications } = useSchedulePublications(memberId || undefined, yearMonth)
  const latestSnapshot = publications[0]
  const { settings: orgSettings } = useOrgSettings()
  const appliedDefaultMonth = useRef(false)

  useEffect(() => {
    if (appliedDefaultMonth.current || !orgSettings) return
    appliedDefaultMonth.current = true
    setYearMonth(defaultSettlementYearMonth(orgSettings.default_last_month_before_5))
  }, [orgSettings])

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

  const reloadExistingSnapshot = () => {
    if (!isOwner || !memberId) return
    supabase
      .from('settlement_snapshots')
      .select('*')
      .eq('member_id', memberId)
      .eq('year_month', `${yearMonth}-01`)
      .maybeSingle()
      .then(({ data }) => setExistingSnapshot(data))
  }

  useEffect(() => {
    reloadExistingSnapshot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, memberId, yearMonth])

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
        .select('leave_date, duration_type, hours, is_manager_override, leave_types(name)')
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

    type LeaveJoinRow = {
      leave_date: string
      duration_type: string
      hours: number | null
      is_manager_override: boolean
      leave_types: { name: string } | null
    }
    const leaveMap: Record<string, LeaveJoinRow> = {}
    for (const r of (leaveRows ?? []) as LeaveJoinRow[]) {
      leaveMap[r.leave_date] = r
    }

    const computedRows: SettlementRow[] = normalDates.map((date) => {
      const att = attMap[date]
      const rawStatus: 'normal' | 'abnormal' = att?.status === 'normal' ? 'normal' : 'abnormal'
      const rawHours = att?.hours ?? 0
      const leave = leaveMap[date]

      if (leave?.is_manager_override) {
        return {
          date,
          rawStatus,
          rawHours,
          leaveLabel: '主管同意提早下班',
          leaveTypeName: null,
          leaveContributedHours: 0,
          settledHours: Math.floor((defaultDailyHours + 1e-9) * 2) / 2,
        }
      }

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
        // 無條件捨去到 0.5 小時為單位，例如 3.4 -> 3、3.6 -> 3.5
        // (+1e-9 guards against float noise turning an exact X.5 into X.4999999…)
        settledHours: Math.floor((settledHours + 1e-9) * 2) / 2,
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

  const isSettlementWindowOpen = () => {
    const nextYearMonth = addMonths(yearMonth, 1)
    const windowStart = `${nextYearMonth}-01`
    const windowEnd = `${nextYearMonth}-05`
    const today = todayStr()
    return today >= windowStart && today <= windowEnd
  }

  const handleProduceSnapshot = async () => {
    if (!profile) return
    if (!isSettlementWindowOpen()) {
      window.alert('只能在結算月份的下個月 1 日~5 日之間產出月結')
      return
    }
    setProducing(true)
    const { error } = await supabase.from('settlement_snapshots').insert({
      member_id: memberId,
      year_month: `${yearMonth}-01`,
      snapshot: { rows, totalSettled, leaveTotals } as unknown as Json,
      created_by: profile.id,
    })
    setProducing(false)
    if (error) {
      window.alert(`產出失敗：${error.message}`)
      return
    }
    reloadExistingSnapshot()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">月結系統</h1>
        {isOwner && (
          <div className="flex gap-1">
            <button
              onClick={() => setTab('current')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'current' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              當月月結瀏覽
            </button>
            <button
              onClick={() => setTab('archive')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'archive' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              已過月結結算
            </button>
            <button
              onClick={() => setTab('settings')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'settings' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              月結設定
            </button>
          </div>
        )}
      </div>

      {tab === 'archive' ? (
        <SettlementArchive />
      ) : tab === 'settings' ? (
        <SettlementSettings />
      ) : (
        <>
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
                      {effectiveDisplayName(m)}
                      {m.id === profile?.id ? '（我）' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <MonthSelector value={yearMonth} onChange={setYearMonth} />
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

          {isOwner && !loading && rows.length > 0 && (
            <div className="mt-4 pt-3 border-t flex items-center justify-end">
              {existingSnapshot ? (
                <span className="text-sm text-green-700">
                  已於 {formatDateTime(existingSnapshot.created_at)} 產出本月月結
                </span>
              ) : (
                <button
                  onClick={handleProduceSnapshot}
                  disabled={producing}
                  className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                >
                  {producing ? '產出中…' : '產出本月月結'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
