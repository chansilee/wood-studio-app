export function formatHours(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return (Math.round(v * 100) / 100).toString()
}

export interface LeaveDisplayLeaveRequest {
  status: 'pending' | 'approved' | 'rejected'
  duration_type: 'full_day' | 'partial'
  hours: number | string | null
  leave_type_name?: string
}

export interface LeaveDisplayResult {
  label: string
  colorClass: string
  clickable: boolean
  /** whether the raw attendance is treated as covered once leave is factored in */
  qualifies?: boolean
}

/**
 * Single source of truth for how a leave-calendar day cell (and its detail panel)
 * renders, given the raw attendance for that day and any leave request on it.
 */
export function computeLeaveDisplay({
  isPast,
  rawStatus,
  rawHours,
  defaultDailyHours,
  leaveRequest,
}: {
  isPast: boolean
  rawStatus: 'normal' | 'abnormal'
  rawHours: number | string | null
  defaultDailyHours: number | string
  leaveRequest?: LeaveDisplayLeaveRequest
}): LeaveDisplayResult {
  if (!isPast) {
    return { label: '', colorClass: 'bg-white text-gray-300', clickable: false }
  }

  if (leaveRequest) {
    if (leaveRequest.status === 'pending') {
      return { label: '審核中', colorClass: 'bg-yellow-50 text-yellow-800', clickable: true }
    }
    if (leaveRequest.status === 'approved') {
      const typeName = leaveRequest.leave_type_name ?? '假別'
      if (leaveRequest.duration_type === 'full_day') {
        return {
          label: `全天${typeName}`,
          colorClass: 'bg-blue-50 text-blue-800',
          clickable: true,
          qualifies: true,
        }
      }
      const raw = Number(rawHours ?? 0)
      const leaveHours = Number(leaveRequest.hours ?? 0)
      const qualifies = raw + leaveHours >= Number(defaultDailyHours)
      return {
        label: `${qualifies ? '正常' : '異常'}出勤${formatHours(raw)}小時+${formatHours(leaveHours)}小時${typeName}`,
        colorClass: qualifies ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
        clickable: true,
        qualifies,
      }
    }
    // rejected: fall through to plain raw-status display, still clickable (owner can delete to reset)
  }

  return {
    label: `${rawStatus === 'normal' ? '正常' : '異常'}出勤${formatHours(rawHours)}小時`,
    colorClass: rawStatus === 'normal' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
    clickable: rawStatus === 'abnormal' || !!leaveRequest,
    qualifies: rawStatus === 'normal',
  }
}
