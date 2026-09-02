import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { useSchedulePublications, type PublicationSnapshotEntry } from '@/modules/scheduling/usePublications'
import { formatHours } from '@/modules/leave/leaveDisplay'
import { ATTENDANCE_BUFFER_HOURS, computeAttendanceStatus, type AttendanceStatusColor } from '@/shared/lib/attendanceStatus'
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

type FinalColor = AttendanceStatusColor
type OvertimeResolution = 'unresolved' | 'paid_as_overtime' | 'self_practice'

// 勞基法加成費率：以「實際每日總工時」精確對齊 8 小時法定門檻（不套用任何
// 緩衝）——8 小時以內（不管是契約工時、進離場緩衝、或已核准的額外出勤）一律
// 原費率；超過 8 小時的前 2 小時 1.33x，第 10 小時起 1.66x
const LEGAL_DAILY_HOURS = 8
const OVERTIME_TIER2_LIMIT_HOURS = 2
const OVERTIME_TIER2_RATE = 1.33
const OVERTIME_TIER3_RATE = 1.66
// 超出契約工時多少以內，視為進離場緩衝，不需要負責人特別確認 — 跟請假系統
// 共用同一個門檻常數，兩邊顏色/文字才不會走鐘
const OVERTIME_FACT_THRESHOLD_HOURS = ATTENDANCE_BUFFER_HOURS

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function computeTotalWage(
  normalRateHours: number,
  tier2Hours: number,
  tier3Hours: number,
  leaveTotals: Record<string, number>,
  hourlyWage: number | null,
  leaveTypeMeta: Record<string, { pay_coefficient: number; description: string }>
): number | null {
  if (hourlyWage == null) return null
  let sum =
    normalRateHours * hourlyWage +
    tier2Hours * hourlyWage * OVERTIME_TIER2_RATE +
    tier3Hours * hourlyWage * OVERTIME_TIER3_RATE
  for (const [name, hours] of Object.entries(leaveTotals)) {
    const meta = leaveTypeMeta[name]
    if (meta) sum += hours * hourlyWage * meta.pay_coefficient
  }
  return sum
}

interface SettlementRow {
  date: string
  clockInAt: string | null
  clockOutAt: string | null
  rawHours: number
  contractHours: number
  contractLabel: string // "6小時" or "6小時+1小時預報"
  leaveTypeName: string | null
  leaveContributedHours: number
  isAbsence: boolean
  isManagerOverride: boolean
  overtimeApprovedHours: number
  // raw excess beyond contracted hours (uncapped) — drives 超出/不足時數 and
  // the 延工/自主時間確認 threshold
  overtimeExcess: number
  // the slice of overtimeExcess not already covered by an approved 額外出勤
  overtimeUnresolved: number
  overtimeResolution: OvertimeResolution
  // 給薪時數 breakdown, kept separate so the monthly total can apply the
  // right multiplier to each tier
  normalRateHours: number
  tier2Hours: number
  tier3Hours: number
  paidHours: number
  finalColor: FinalColor
  statusNote: string // 請假 / 出勤狀況註記
  varianceLabel: string // 超出/不足時數
  overtimeConfirmationText: string
  needsOvertimeChoice: boolean
}

// 真正的曠職：整天完全沒有出勤事實（0 小時）且完全沒有請假紀錄——這才是傳統
// 定義的「沒出現」。任何有部分打卡/補登/請假資訊、只是時數不足的紅字，都不算
// 曠職，而是資料本身有問題，必須先回去修正，不能自動吞成曠職。
function isTrueAbsenceCandidate(r: SettlementRow): boolean {
  return r.finalColor === 'red' && !r.isAbsence && r.rawHours === 0 && !r.leaveTypeName
}

function formatClockTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })
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

    const [
      { data: profileRow },
      { data: attRows },
      { data: leaveRows },
      { data: wageRow },
      { data: otRows },
      { data: factRows },
    ] = await Promise.all([
      supabase.from('profiles').select('default_daily_hours').eq('id', memberId).single(),
      supabase
        .from('attendance_summary')
        .select('work_date, worked_hours, clock_in_at, clock_out_at')
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
      supabase
        .from('overtime_pre_reports')
        .select('work_date, requested_hours, status')
        .eq('member_id', memberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('attendance_overtime_facts')
        .select('work_date, resolution, recorded_by, recorded_at')
        .eq('member_id', memberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
    ])

    const ddh = Number(profileRow?.default_daily_hours ?? 6)
    setHourlyWage(wageRow ? Number(wageRow.hourly_wage) : null)

    const attMap: Record<string, { hours: number; clockInAt: string | null; clockOutAt: string | null }> = {}
    for (const r of attRows ?? []) {
      if (r.work_date) {
        attMap[r.work_date] = {
          hours: Number(r.worked_hours ?? 0),
          clockInAt: r.clock_in_at,
          clockOutAt: r.clock_out_at,
        }
      }
    }

    const otMap: Record<string, { requestedHours: number; status: string }> = {}
    for (const r of otRows ?? []) {
      otMap[r.work_date] = { requestedHours: Number(r.requested_hours), status: r.status }
    }

    const factMap: Record<
      string,
      { resolution: OvertimeResolution; recordedBy: string | null; recordedAt: string | null }
    > = {}
    for (const r of factRows ?? []) {
      factMap[r.work_date] = { resolution: r.resolution, recordedBy: r.recorded_by, recordedAt: r.recorded_at }
    }
    const recorderIds = Array.from(
      new Set(Object.values(factMap).map((f) => f.recordedBy).filter((id): id is string => !!id))
    )
    let recorderNames: Record<string, string> = {}
    if (recorderIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, preferred_display_name')
        .in('id', recorderIds)
      recorderNames = Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)]))
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
      const rawHours = att?.hours ?? 0
      const clockInAt = att?.clockInAt ?? null
      const clockOutAt = att?.clockOutAt ?? null
      const leave = leaveMap[date]
      const ot = otMap[date]

      const isAbsence = !!leave?.is_absence
      const isManagerOverride = !!leave?.is_manager_override
      const isRegularLeave = !!leave && !isAbsence && !isManagerOverride

      const leaveTypeName = isRegularLeave ? leave.leave_types?.name ?? '未知假別' : null
      const leaveCoefficient = isRegularLeave ? Number(leave.leave_types?.pay_coefficient ?? 1) : null
      const leaveContributedHours = !isRegularLeave
        ? 0
        : leave.duration_type === 'full_day'
          ? ddh
          : Number(leave.hours ?? 0)

      // overtime only applies on an otherwise-ordinary day — 曠職 already has
      // its own zero-pay logic below. 主管同意提早下班 only recolors/relabels
      // the day (red -> blue); it does not touch hours, so it goes through
      // this exact same pay/overtime logic as a normal day
      const approvedCap = !isAbsence && ot?.status === 'approved' ? ot.requestedHours : 0

      const {
        color: finalColor,
        statusNote,
        varianceLabel,
        contractLabel,
        unresolvedExcessHours: unresolvedExcess,
      } = computeAttendanceStatus({
        rawHours,
        contractHours: ddh,
        isAbsence,
        isManagerOverride,
        isFullDayLeave: isRegularLeave && leave!.duration_type === 'full_day',
        isPartialLeave: isRegularLeave && leave!.duration_type !== 'full_day',
        leaveTypeName,
        leaveHours: isRegularLeave ? Number(leave!.hours ?? 0) : null,
        leaveCoefficient,
        leaveContributedHours,
        approvedOvertimeHours: approvedCap,
      })
      const excess = Math.max(0, rawHours - ddh)

      // 勞動部要求在場的每一分鐘都要核算到錢：沒有核准額外出勤時，正常給薪
      // 上限是契約工時+0.25小時緩衝；有核准額外出勤時，上限直接延伸為契約
      // 工時+核准時數（不疊加緩衝）——跟 computeAttendanceStatus 用同一套門檻
      const ceiling = approvedCap > 1e-9 ? ddh + approvedCap : ddh + OVERTIME_FACT_THRESHOLD_HOURS

      const fact = factMap[date]
      const resolution = fact?.resolution ?? 'unresolved'
      const recorderTag = fact?.recordedBy
        ? `由 ${recorderNames[fact.recordedBy] ?? '未知'} 於 ${fact.recordedAt ? formatDateTime(fact.recordedAt) : '未知時間'} `
        : ''

      let overtimeConfirmationText = '—'
      let needsOvertimeChoice = false
      let resolutionPaid = 0
      if (!isAbsence) {
        if (unresolvedExcess <= 1e-9) {
          if (approvedCap > 1e-9) overtimeConfirmationText = `已依額外出勤核准${formatHours(approvedCap)}小時`
          else overtimeConfirmationText = excess > 1e-9 ? '屬進離場緩衝，無延工事實' : '無'
        } else if (resolution === 'paid_as_overtime') {
          overtimeConfirmationText = `${recorderTag}核算延工費${formatHours(unresolvedExcess)}小時`
          resolutionPaid = unresolvedExcess
        } else if (resolution === 'self_practice') {
          overtimeConfirmationText = `${recorderTag}簽認：下班自主練習，無延工事實`
        } else {
          overtimeConfirmationText = '等待員工簽認…'
          needsOvertimeChoice = true
        }
      }

      let normalRateHours: number
      let tier2Hours: number
      let tier3Hours: number
      let paidHours: number
      if (isAbsence) {
        normalRateHours = 0
        tier2Hours = 0
        tier3Hours = 0
        paidHours = 0
      } else {
        // hours paid at straight base rate: worked time up to contract itself
        // (or less if leave already covers part of the day)
        const workedComponent = Math.min(rawHours, Math.max(0, ddh - leaveContributedHours))
        // hours actually worked between contract and the ceiling (buffer, or
        // the approved-report allowance) are authorized/paid too, plus
        // anything the owner separately resolved beyond the ceiling (方案A).
        // self_practice-resolved hours stay unpaid entirely.
        const otTierHoursWorked = Math.max(0, Math.min(rawHours, ceiling) - ddh)
        const overtimePaid = otTierHoursWorked + resolutionPaid
        // total hours actually being paid today, from the start of the day —
        // tiering is now anchored to the REAL 8-hour statutory threshold, not
        // to the buffer/report ceiling: everything up to 8 hours (whether
        // contract, buffer, or an approved/resolved 額外出勤) pays at the
        // normal rate; only genuinely working past 8 real hours earns the
        // 1.33x/1.66x premium, with no extra buffer stacked on top of that
        const paidTotal = workedComponent + overtimePaid
        normalRateHours = Math.min(paidTotal, LEGAL_DAILY_HOURS)
        tier2Hours = Math.min(Math.max(paidTotal - LEGAL_DAILY_HOURS, 0), OVERTIME_TIER2_LIMIT_HOURS)
        tier3Hours = Math.max(paidTotal - LEGAL_DAILY_HOURS - OVERTIME_TIER2_LIMIT_HOURS, 0)
        paidHours = normalRateHours + tier2Hours + tier3Hours
      }

      return {
        date,
        clockInAt,
        clockOutAt,
        rawHours,
        contractHours: ddh,
        contractLabel,
        leaveTypeName,
        leaveContributedHours,
        isAbsence,
        isManagerOverride,
        overtimeApprovedHours: approvedCap,
        overtimeExcess: excess,
        overtimeUnresolved: unresolvedExcess,
        overtimeResolution: resolution,
        normalRateHours,
        tier2Hours,
        tier3Hours,
        paidHours,
        finalColor,
        statusNote,
        varianceLabel,
        overtimeConfirmationText,
        needsOvertimeChoice,
      }
    })

    setRows(computedRows)
    setLoading(false)
  }

  const totalNormalRateHours = useMemo(() => round2(rows.reduce((sum, r) => sum + r.normalRateHours, 0)), [rows])
  const totalTier2Hours = useMemo(() => round2(rows.reduce((sum, r) => sum + r.tier2Hours, 0)), [rows])
  const totalTier3Hours = useMemo(() => round2(rows.reduce((sum, r) => sum + r.tier3Hours, 0)), [rows])
  const totalPaidHours = useMemo(() => round2(rows.reduce((sum, r) => sum + r.paidHours, 0)), [rows])

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
    () => computeTotalWage(totalNormalRateHours, totalTier2Hours, totalTier3Hours, leaveTotals, hourlyWage, leaveTypeMeta),
    [totalNormalRateHours, totalTier2Hours, totalTier3Hours, leaveTotals, hourlyWage, leaveTypeMeta]
  )

  // 紅字分兩段：完全沒出勤且沒請假的，可以自動轉曠職；其他任何有部分打卡/
  // 補登/請假但時數仍不足的，一律先擋住，不給產出月結，必須回去修正資料
  const trueAbsenceRows = useMemo(() => rows.filter(isTrueAbsenceCandidate), [rows])
  const blockingRedRows = useMemo(
    () => rows.filter((r) => r.finalColor === 'red' && !r.isAbsence && !isTrueAbsenceCandidate(r)),
    [rows]
  )
  // 超出契約工時、還沒選「方案A/方案B」的日子——沒選就不能產出月結
  const needsOvertimeChoiceRows = useMemo(() => rows.filter((r) => r.needsOvertimeChoice), [rows])

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
        '本月尚有紅字（超出/不足時數）為部分出勤或請假時數不足，並非完全曠職，請先回到打卡系統/請假系統修正該日的紀錄，才能產出本月月結。'
      )
      return
    }
    if (needsOvertimeChoiceRows.length > 0) {
      window.alert('本月尚有超出契約工時、但未選擇「延工/自主時間確認」方案的日子，請先在表格中選擇才能產出本月月結。')
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
            leaveTypeName: null,
            leaveContributedHours: 0,
            normalRateHours: 0,
            tier2Hours: 0,
            tier3Hours: 0,
            paidHours: 0,
            isAbsence: true,
            finalColor: 'red' as const,
            statusNote: '曠職',
          }
        : r
    )
    const finalTotalNormalRateHours = round2(finalRows.reduce((sum, r) => sum + r.normalRateHours, 0))
    const finalTotalTier2Hours = round2(finalRows.reduce((sum, r) => sum + r.tier2Hours, 0))
    const finalTotalTier3Hours = round2(finalRows.reduce((sum, r) => sum + r.tier3Hours, 0))
    const finalTotalPaidHours = round2(finalRows.reduce((sum, r) => sum + r.paidHours, 0))
    const finalLeaveTotals: Record<string, number> = {}
    for (const r of finalRows) {
      if (r.leaveTypeName) {
        finalLeaveTotals[r.leaveTypeName] = (finalLeaveTotals[r.leaveTypeName] ?? 0) + r.leaveContributedHours
      }
    }
    // wage rate + leave-type pay coefficients/descriptions are mirrored into the
    // snapshot as of production time, since either could change later and this
    // snapshot must keep reflecting what was true when it was produced
    const finalTotalWage = computeTotalWage(
      finalTotalNormalRateHours,
      finalTotalTier2Hours,
      finalTotalTier3Hours,
      finalLeaveTotals,
      hourlyWage,
      leaveTypeMeta
    )

    const { error } = await supabase.from('settlement_snapshots').insert({
      member_id: memberId,
      year_month: `${yearMonth}-01`,
      snapshot: {
        rows: finalRows,
        totalPaidHours: finalTotalPaidHours,
        totalNormalRateHours: finalTotalNormalRateHours,
        totalTier2Hours: finalTotalTier2Hours,
        totalTier3Hours: finalTotalTier3Hours,
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
    <div className="p-6 max-w-6xl mx-auto">
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
            以「最新公告」的排班為準，僅列出已結算（隔天才結算）的正常班日期。給薪時數以精確數字計算，不做 0.5
            小時規整；超出契約工時的部分，只有已核准的額外出勤上限內、或負責人選擇「方案A：核算延工費」才會給薪。
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
                      <th className="py-1 pr-4">上班打卡</th>
                      <th className="py-1 pr-4">下班打卡</th>
                      <th className="py-1 pr-4">實際停留時數</th>
                      <th className="py-1 pr-4">契約工時</th>
                      <th className="py-1 pr-4">請假 / 出勤狀況註記</th>
                      <th className="py-1 pr-4">超出/不足時數</th>
                      <th className="py-1 pr-4">延工 / 自主時間確認</th>
                      <th className="py-1 pr-4">給薪時數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.date} className="border-b align-top">
                        <td className="py-1 pr-4 whitespace-nowrap">{formatDateSlash(r.date)}</td>
                        <td className="py-1 pr-4 whitespace-nowrap">{formatClockTime(r.clockInAt)}</td>
                        <td className="py-1 pr-4 whitespace-nowrap">{formatClockTime(r.clockOutAt)}</td>
                        <td className="py-1 pr-4 whitespace-nowrap">{formatHours(r.rawHours)}小時</td>
                        <td className="py-1 pr-4 whitespace-nowrap">{r.contractLabel}</td>
                        <td
                          className={`py-1 pr-4 ${
                            r.finalColor === 'green'
                              ? 'text-green-700'
                              : r.finalColor === 'blue'
                                ? 'text-blue-700'
                                : 'text-red-600'
                          }`}
                        >
                          {r.statusNote}
                        </td>
                        <td
                          className={`py-1 pr-4 whitespace-nowrap ${
                            r.finalColor === 'green'
                              ? 'text-green-700'
                              : r.finalColor === 'blue'
                                ? 'text-blue-700'
                                : 'text-red-600'
                          }`}
                        >
                          {r.varianceLabel}
                        </td>
                        <td className="py-1 pr-4">
                          {r.isAbsence || r.isManagerOverride ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span className={`text-xs ${r.needsOvertimeChoice ? 'text-amber-700 font-medium' : ''}`}>
                              {r.overtimeConfirmationText}
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-4 whitespace-nowrap">{formatHours(r.paidHours)}小時</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!existingSnapshot && blockingRedRows.length > 0 && (
                <p className="text-sm text-red-600 font-medium mb-4">
                  本月尚有紅字（超出/不足時數）為部分出勤或請假時數不足，並非完全曠職，請先回到打卡系統/請假系統修正該日的紀錄，才能產出本月月結。
                </p>
              )}
              {!existingSnapshot && blockingRedRows.length === 0 && needsOvertimeChoiceRows.length > 0 && (
                <p className="text-sm text-red-600 font-medium mb-4">
                  本月有 {needsOvertimeChoiceRows.length}{' '}
                  天超出契約工時但尚未選擇「延工/自主時間確認」方案，請先在表格中選擇才能產出本月月結。
                </p>
              )}
              {!existingSnapshot &&
                blockingRedRows.length === 0 &&
                needsOvertimeChoiceRows.length === 0 &&
                trueAbsenceRows.length > 0 && (
                  <p className="text-sm text-red-600 font-medium mb-4">
                    本月有 {trueAbsenceRows.length} 天完全未出勤（無任何打卡）且未請假，產出月結時將自動轉為曠職。
                  </p>
                )}

              <div className="border-t pt-3 text-sm space-y-1">
                <p className="font-medium">{month}月全月總結：</p>
                <p>
                  給薪時數（原費率）：{formatHours(totalNormalRateHours)}小時
                  {hourlyWage != null && (
                    <>
                      {' '}
                      x 時薪${formatMoney(hourlyWage)} = ${formatMoney(totalNormalRateHours * hourlyWage)}
                    </>
                  )}
                </p>
                {totalTier2Hours > 0 && (
                  <p>
                    給薪時數（1.33倍）：{formatHours(totalTier2Hours)}小時
                    {hourlyWage != null && (
                      <>
                        {' '}
                        x 時薪${formatMoney(hourlyWage * OVERTIME_TIER2_RATE)} = $
                        {formatMoney(totalTier2Hours * hourlyWage * OVERTIME_TIER2_RATE)}
                      </>
                    )}
                  </p>
                )}
                {totalTier3Hours > 0 && (
                  <p>
                    給薪時數（1.66倍）：{formatHours(totalTier3Hours)}小時
                    {hourlyWage != null && (
                      <>
                        {' '}
                        x 時薪${formatMoney(hourlyWage * OVERTIME_TIER3_RATE)} = $
                        {formatMoney(totalTier3Hours * hourlyWage * OVERTIME_TIER3_RATE)}
                      </>
                    )}
                  </p>
                )}
                <p className="text-xs text-gray-500">給薪時數合計：{formatHours(totalPaidHours)}小時</p>
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
                  disabled={producing || blockingRedRows.length > 0 || needsOvertimeChoiceRows.length > 0}
                  title={
                    blockingRedRows.length > 0
                      ? '本月尚有部分出勤/請假時數不足的紅字，需先修正才能產出'
                      : needsOvertimeChoiceRows.length > 0
                        ? '本月尚有超出契約工時未選擇方案的日子，需先選擇才能產出'
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
