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
import { isSelectableMember } from '@/shared/lib/members'
import {
  addMonths,
  daysInMonth,
  defaultSettlementYearMonth,
  formatDateSlash,
  formatDateTime,
  pad2,
  todayStr,
} from '@/shared/lib/date'
import type { Json, Tables, TablesInsert } from '@/shared/types/database'

type Profile = Tables<'profiles'>
type SettlementSnapshotRow = Tables<'settlement_snapshots'>

type FinalColor = 'green' | 'blue' | 'red'

export function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function computeTotalWage(
  totalSettledHours: number,
  leaveTotals: Record<string, number>,
  hourlyWage: number | null,
  leaveTypeMeta: Record<string, { pay_coefficient: number; description: string }>
): number | null {
  if (hourlyWage == null) return null
  let sum = totalSettledHours * hourlyWage
  for (const [name, hours] of Object.entries(leaveTotals)) {
    const meta = leaveTypeMeta[name]
    if (meta) sum += hours * hourlyWage * meta.pay_coefficient
  }
  return sum
}

interface SettlementRow {
  date: string
  rawStatus: 'normal' | 'abnormal'
  rawHours: number
  leaveLabel: string
  leaveTypeName: string | null
  leaveContributedHours: number
  settledHours: number
  isAbsence: boolean
  finalColor: FinalColor
  finalLabel: string
}

// 真正的曠職：整天完全沒有出勤事實（0 小時）且完全沒有請假紀錄——這才是傳統
// 定義的「沒出現」。任何有部分打卡/補登/請假資訊、只是時數不足的紅字，都不算
// 曠職，而是資料本身有問題，必須先回去修正，不能自動吞成曠職。
function isTrueAbsenceCandidate(r: SettlementRow): boolean {
  return r.finalColor === 'red' && !r.isAbsence && r.rawHours === 0 && !r.leaveTypeName
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
  const [hourlyWage, setHourlyWage] = useState<number | null>(null)
  const [leaveTypeMeta, setLeaveTypeMeta] = useState<
    Record<string, { pay_coefficient: number; description: string }>
  >({})

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
        const selectable = (data ?? []).filter(isSelectableMember)
        setMembers(selectable)
        setSelectedMemberId((prev) => prev || (selectable.some((m) => m.id === profile.id) ? profile.id : selectable[0]?.id) || '')
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

    const [{ data: profileRow }, { data: attRows }, { data: leaveRows }, { data: wageRow }] = await Promise.all([
      supabase.from('profiles').select('default_daily_hours').eq('id', memberId).single(),
      supabase
        .from('attendance_summary')
        .select('work_date, attendance_status, worked_hours')
        .eq('member_id', memberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('leave_requests')
        .select(
          'leave_date, duration_type, hours, is_manager_override, is_absence, leave_types(name, pay_coefficient, description)'
        )
        .eq('member_id', memberId)
        .eq('status', 'approved')
        .gte('leave_date', firstDay)
        .lte('leave_date', lastDay),
      supabase
        .from('member_wage_rates')
        .select('hourly_wage')
        .eq('member_id', memberId)
        // a mid-month hire's first wage rate takes effect on the hire date itself
        // (not necessarily the 1st), so match against the END of the settlement
        // month, not the start, or a wage that started partway through the month
        // would never be found for that month
        .lte('effective_date', lastDay)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const ddh = Number(profileRow?.default_daily_hours ?? 6)
    setHourlyWage(wageRow ? Number(wageRow.hourly_wage) : null)

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
      is_absence: boolean
      leave_types: { name: string; pay_coefficient: number; description: string } | null
    }
    const leaveMap: Record<string, LeaveJoinRow> = {}
    const typeMeta: Record<string, { pay_coefficient: number; description: string }> = {}
    for (const r of (leaveRows ?? []) as LeaveJoinRow[]) {
      leaveMap[r.leave_date] = r
      if (r.leave_types) {
        typeMeta[r.leave_types.name] = {
          pay_coefficient: Number(r.leave_types.pay_coefficient),
          description: r.leave_types.description,
        }
      }
    }
    setLeaveTypeMeta(typeMeta)

    const computedRows: SettlementRow[] = normalDates.map((date) => {
      const att = attMap[date]
      const rawStatus: 'normal' | 'abnormal' = att?.status === 'normal' ? 'normal' : 'abnormal'
      const rawHours = att?.hours ?? 0
      const leave = leaveMap[date]

      if (leave?.is_absence) {
        return {
          date,
          rawStatus,
          rawHours,
          leaveLabel: '曠職',
          leaveTypeName: null,
          leaveContributedHours: 0,
          settledHours: 0,
          isAbsence: true,
          finalColor: 'red',
          finalLabel: '曠職',
        }
      }

      if (leave?.is_manager_override) {
        return {
          date,
          rawStatus,
          rawHours,
          leaveLabel: '主管同意提早下班',
          leaveTypeName: null,
          leaveContributedHours: 0,
          settledHours: Math.floor((ddh + 1e-9) * 2) / 2,
          isAbsence: false,
          finalColor: 'blue',
          finalLabel: '主管同意提早下班',
        }
      }

      let leaveLabel = '無'
      let leaveTypeName: string | null = null
      let leaveContributedHours = 0
      if (leave) {
        leaveTypeName = leave.leave_types?.name ?? '未知假別'
        if (leave.duration_type === 'full_day') {
          leaveLabel = `全天${leaveTypeName}`
          leaveContributedHours = ddh
        } else {
          const h = Number(leave.hours ?? 0)
          leaveLabel = `${formatHours(h)}小時${leaveTypeName}`
          leaveContributedHours = h
        }
      }

      const requiredRemaining = Math.max(0, ddh - leaveContributedHours)
      const settledHours = Math.min(rawHours, requiredRemaining)

      let finalColor: FinalColor
      let finalLabel: string
      if (leave && leave.duration_type === 'full_day') {
        finalColor = 'blue'
        finalLabel = leaveLabel
      } else if (leave) {
        const qualifies = rawHours + leaveContributedHours + 1e-9 >= ddh
        finalColor = qualifies ? 'green' : 'red'
        finalLabel = `${qualifies ? '正常' : '異常'}出勤${formatHours(rawHours)}小時 + ${leaveLabel}`
      } else {
        finalColor = rawStatus === 'normal' ? 'green' : 'red'
        finalLabel = `${rawStatus === 'normal' ? '正常' : '異常'}出勤${formatHours(rawHours)}小時`
      }

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
        isAbsence: false,
        finalColor,
        finalLabel,
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

  const totalWage = useMemo(
    () => computeTotalWage(totalSettled, leaveTotals, hourlyWage, leaveTypeMeta),
    [totalSettled, leaveTotals, hourlyWage, leaveTypeMeta]
  )

  // 紅字分兩段：完全沒出勤且沒請假的，可以自動轉曠職；其他任何有部分打卡/
  // 補登/請假但時數仍不足的，一律先擋住，不給產出月結，必須回去修正資料
  const trueAbsenceRows = useMemo(() => rows.filter(isTrueAbsenceCandidate), [rows])
  const blockingRedRows = useMemo(
    () => rows.filter((r) => r.finalColor === 'red' && !r.isAbsence && !isTrueAbsenceCandidate(r)),
    [rows]
  )

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
    if (blockingRedRows.length > 0) {
      window.alert(
        '本月尚有紅字（最終出勤狀態）為部分出勤或請假時數不足，並非完全曠職，請先回到打卡系統/請假系統修正該日的紀錄，才能產出本月月結。'
      )
      return
    }
    if (trueAbsenceRows.length > 0) {
      const proceed = window.confirm(
        `本月有 ${trueAbsenceRows.length} 天完全未出勤（無任何打卡）且未請假，若不依正常程序請假，將直接轉成曠職，確定要繼續嗎？`
      )
      if (!proceed) return
    }
    setProducing(true)

    // dates still red at this point (that don't already carry an is_absence
    // record from a previous produce/delete cycle) become 曠職 — inserted
    // BEFORE the snapshot, since the snapshot insert triggers the month-lock
    // that would otherwise block this insert.
    const absenceDates = trueAbsenceRows.map((r) => r.date)
    if (absenceDates.length > 0) {
      const payload: TablesInsert<'leave_requests'>[] = absenceDates.map((date) => ({
        member_id: memberId,
        leave_date: date,
        is_absence: true,
        leave_type_id: null,
        duration_type: 'full_day',
      }))
      const { error: absenceError } = await supabase.from('leave_requests').insert(payload)
      if (absenceError) {
        setProducing(false)
        window.alert(`曠職登記失敗：${absenceError.message}`)
        return
      }
    }

    const finalRows: SettlementRow[] = rows.map((r) =>
      absenceDates.includes(r.date)
        ? {
            ...r,
            leaveLabel: '曠職',
            leaveTypeName: null,
            leaveContributedHours: 0,
            settledHours: 0,
            isAbsence: true,
            finalColor: 'red' as const,
            finalLabel: '曠職',
          }
        : r
    )
    const finalTotalSettled = Math.round(finalRows.reduce((sum, r) => sum + r.settledHours, 0) * 100) / 100
    const finalLeaveTotals: Record<string, number> = {}
    for (const r of finalRows) {
      if (r.leaveTypeName) {
        finalLeaveTotals[r.leaveTypeName] = (finalLeaveTotals[r.leaveTypeName] ?? 0) + r.leaveContributedHours
      }
    }
    // wage rate + leave-type pay coefficients/descriptions are mirrored into the
    // snapshot as of production time, since either could change later and this
    // snapshot must keep reflecting what was true when it was produced
    const finalTotalWage = computeTotalWage(finalTotalSettled, finalLeaveTotals, hourlyWage, leaveTypeMeta)

    const { error } = await supabase.from('settlement_snapshots').insert({
      member_id: memberId,
      year_month: `${yearMonth}-01`,
      snapshot: {
        rows: finalRows,
        totalSettled: finalTotalSettled,
        leaveTotals: finalLeaveTotals,
        hourlyWage,
        leaveTypeMeta,
        totalWage: finalTotalWage,
      } as unknown as Json,
      created_by: profile.id,
    })
    if (error) {
      setProducing(false)
      window.alert(`產出失敗：${error.message}`)
      return
    }
    await load()
    setProducing(false)
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
                      <th className="py-1 pr-4">原出勤狀態</th>
                      <th className="py-1 pr-4">請假加班</th>
                      <th className="py-1 pr-4">最終出勤狀態</th>
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
                        <td
                          className={`py-1 pr-4 font-medium ${
                            r.finalColor === 'green'
                              ? 'text-green-700'
                              : r.finalColor === 'blue'
                                ? 'text-blue-700'
                                : 'text-red-600'
                          }`}
                        >
                          {r.finalLabel}
                        </td>
                        <td className="py-1 pr-4">{formatHours(r.settledHours)}小時</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!existingSnapshot && blockingRedRows.length > 0 && (
                <p className="text-sm text-red-600 font-medium mb-4">
                  本月尚有紅字（最終出勤狀態）為部分出勤或請假時數不足，並非完全曠職，請先回到打卡系統/請假系統修正該日的紀錄，才能產出本月月結。
                </p>
              )}
              {!existingSnapshot && blockingRedRows.length === 0 && trueAbsenceRows.length > 0 && (
                <p className="text-sm text-red-600 font-medium mb-4">
                  本月有 {trueAbsenceRows.length} 天完全未出勤（無任何打卡）且未請假，產出月結時將自動轉為曠職。
                </p>
              )}

              <div className="border-t pt-3 text-sm space-y-1">
                <p className="font-medium">{month}月全月總結：</p>
                <p>
                  規整上班時數：{formatHours(totalSettled)}小時
                  {hourlyWage != null && (
                    <>
                      {' '}
                      x 時薪${formatMoney(hourlyWage)} = ${formatMoney(totalSettled * hourlyWage)}
                    </>
                  )}
                </p>
                {Object.entries(leaveTotals).map(([name, hours]) => {
                  const meta = leaveTypeMeta[name]
                  const perHourWage = meta && hourlyWage != null ? hourlyWage * meta.pay_coefficient : null
                  return (
                    <p key={name}>
                      {name}：{formatHours(hours)}小時
                      {perHourWage != null && (
                        <>
                          {' '}
                          x 時薪${formatMoney(perHourWage)}
                          {meta?.description ? ` (${meta.description})` : ''} = $
                          {formatMoney(hours * perHourWage)}
                        </>
                      )}
                    </p>
                  )
                })}
                {hourlyWage == null && (
                  <p className="text-xs text-gray-400">（尚未設定時薪，無法計算金額）</p>
                )}
                {hourlyWage != null && totalWage != null && (
                  <>
                    <hr className="my-2 border-gray-300" />
                    <p className="font-medium">
                      {month}月全部本薪薪資：${formatMoney(totalWage)}
                    </p>
                  </>
                )}
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
                  disabled={producing || blockingRedRows.length > 0}
                  title={
                    blockingRedRows.length > 0
                      ? '本月尚有部分出勤/請假時數不足的紅字，需先修正才能產出'
                      : undefined
                  }
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
