import { formatHours } from '@/modules/leave/leaveDisplay'

// 每日打卡容許的進離場緩衝：勞動部要求在場每一分鐘都要核算到錢，所以緩衝內
// 的時間一律視為正常出勤（不擋月結、不需要延工/自主時間確認），但超出緩衝的
// 落差仍然照實列出。同一份邏輯被「請假系統」的日曆格子跟「月結系統」共用，
// 兩邊的顏色/文字才不會走鐘。
export const ATTENDANCE_BUFFER_HOURS = 0.25

export function leavePaySuffix(coefficient: number): string {
  if (coefficient <= 0) return '不給薪'
  if (coefficient >= 1) return '全薪'
  if (coefficient === 0.5) return '依法發給半薪'
  return `給薪比例${Math.round(coefficient * 100)}%`
}

export type AttendanceStatusColor = 'green' | 'blue' | 'red'

export interface AttendanceStatusInput {
  rawHours: number
  contractHours: number
  isAbsence: boolean
  isManagerOverride: boolean
  isFullDayLeave: boolean
  isPartialLeave: boolean
  leaveTypeName: string | null
  leaveHours: number | null
  leaveCoefficient: number | null
  /** hours already contributed to the contracted day by leave (0 for no/partial-uncovered leave) */
  leaveContributedHours: number
  /** approved 額外出勤 hours for this day (0 if none/not approved). When >0, the
   * "still normal, no confirmation needed" ceiling extends from contract+0.25
   * straight to contract+this amount — no extra buffer stacked on top. The
   * floor (contract-0.25) never moves, regardless of an approved report. */
  approvedOvertimeHours: number
}

export interface AttendanceStatusResult {
  color: AttendanceStatusColor
  statusNote: string
  varianceLabel: string
  /** contract-hours display, e.g. "6小時" or "6小時+1小時預報" */
  contractLabel: string
  /** hours still beyond the (possibly report-extended) ceiling that need a
   * 延工/自主時間確認 decision; 0 once within bounds or already resolved-agnostic
   * (this is the raw gap — callers decide whether it's already resolved) */
  unresolvedExcessHours: number
}

export function contractHoursLabel(contractHours: number, approvedOvertimeHours: number): string {
  return approvedOvertimeHours > 1e-9
    ? `${formatHours(contractHours)}小時+${formatHours(approvedOvertimeHours)}小時預報`
    : `${formatHours(contractHours)}小時`
}

export function computeAttendanceStatus(input: AttendanceStatusInput): AttendanceStatusResult {
  const {
    rawHours,
    contractHours: ddh,
    isAbsence,
    isManagerOverride,
    isFullDayLeave,
    isPartialLeave,
    leaveTypeName,
    leaveHours,
    leaveCoefficient,
    leaveContributedHours,
    approvedOvertimeHours,
  } = input

  const hasApprovedOt = approvedOvertimeHours > 1e-9
  const excess = Math.max(0, rawHours - ddh)
  const shortfall = Math.max(0, ddh - rawHours)
  const ceiling = hasApprovedOt ? ddh + approvedOvertimeHours : ddh + ATTENDANCE_BUFFER_HOURS
  const unresolvedExcessHours = Math.max(0, rawHours - ceiling)

  const varianceLabel = hasApprovedOt
    ? unresolvedExcessHours > 1e-9
      ? `+${formatHours(unresolvedExcessHours)}小時`
      : shortfall > 1e-9
        ? `不足${formatHours(shortfall)}小時`
        : '0小時'
    : excess > 1e-9
      ? `+${formatHours(excess)}小時`
      : shortfall > 1e-9
        ? `不足${formatHours(shortfall)}小時`
        : '0小時'

  let statusNote: string
  if (isAbsence) {
    statusNote = '曠職'
  } else if (isManagerOverride) {
    statusNote = '主管同意免除勞務（提早離場）'
  } else if (isFullDayLeave) {
    statusNote = `全天${leaveTypeName}（${leavePaySuffix(leaveCoefficient ?? 1)}）`
  } else if (isPartialLeave) {
    statusNote = `請${leaveTypeName}${formatHours(leaveHours ?? 0)}小時`
  } else if (unresolvedExcessHours > 1e-9) {
    statusNote = hasApprovedOt
      ? `異常出勤（+${formatHours(excess)}小時/超過${formatHours(approvedOvertimeHours)}小時預報）`
      : `異常出勤（超出約${formatHours(excess)}小時）`
  } else if (shortfall > ATTENDANCE_BUFFER_HOURS) {
    statusNote = `異常出勤（不足約${formatHours(shortfall)}小時）`
  } else if (hasApprovedOt && excess > ATTENDANCE_BUFFER_HOURS) {
    statusNote = `正常出勤（+${formatHours(excess)}小時/包含於${formatHours(approvedOvertimeHours)}小時預報）`
  } else if (excess > 1e-9 || shortfall > 1e-9) {
    statusNote = '正常出勤（含15分進離場緩衝）'
  } else {
    statusNote = '正常出勤'
  }

  let color: AttendanceStatusColor
  if (isAbsence) color = 'red'
  else if (isManagerOverride) color = 'blue'
  else if (isFullDayLeave) color = 'blue'
  else {
    // a shortfall within the 15-min buffer qualifies too, same tolerance as
    // the excess side — doesn't block settlement or need leave to cover it.
    // the excess side qualifies up to the (possibly report-extended) ceiling.
    const qualifiesLow = rawHours + leaveContributedHours + ATTENDANCE_BUFFER_HOURS + 1e-9 >= ddh
    const qualifiesHigh = unresolvedExcessHours <= 1e-9
    color = qualifiesLow && qualifiesHigh ? 'green' : 'red'
  }

  return { color, statusNote, varianceLabel, contractLabel: contractHoursLabel(ddh, approvedOvertimeHours), unresolvedExcessHours }
}
