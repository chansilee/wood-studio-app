import type { Enums } from '@/shared/types/database'

export type MemberRole = Enums<'member_role'>

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: '負責人',
  staff: '正式員工',
  apprentice: '學徒',
  guest: '訪客',
}

export const SHIFT_STATUS_LABELS: Record<Enums<'shift_status'>, string> = {
  normal: '正常班',
  unscheduled: '未排班',
  regular_off: '例假',
  special_off: '休假',
}

export const CALENDAR_OVERRIDE_LABELS: Record<Enums<'calendar_override_type'>, string> = {
  national_holiday: '國定假日',
  disaster_leave: '天災假',
  election_leave: '選舉假',
  other: '其他',
}

/**
 * Whether this override type fully masks the day (no schedule possible, no attendance).
 * 天災假/選舉假 are advisory-only: the day keeps its normal shift editing/attendance behavior.
 */
export const CALENDAR_OVERRIDE_FULL_MASK: Record<Enums<'calendar_override_type'>, boolean> = {
  national_holiday: true,
  disaster_leave: false,
  election_leave: false,
  other: true,
}

export const WORK_LOG_TYPE_LABELS: Record<Enums<'work_log_type'>, string> = {
  production: '製作',
  learning: '學習',
}

export const LEAVE_STATUS_LABELS: Record<Enums<'leave_status'>, string> = {
  pending: '審核中',
  approved: '已同意',
  rejected: '不同意',
}

export const LEAVE_DURATION_TYPE_LABELS: Record<Enums<'leave_duration_type'>, string> = {
  full_day: '全天',
  partial: '部分時數',
}
