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

export const LEAVE_TYPE_LABELS: Record<Enums<'leave_type'>, string> = {
  personal: '事假',
  sick: '病假',
  marriage: '婚假',
  bereavement: '喪假',
  official: '公出',
  absence: '曠職',
}

export const CALENDAR_OVERRIDE_LABELS: Record<Enums<'calendar_override_type'>, string> = {
  national_holiday: '國定假日',
  disaster_leave: '天災假',
  election_leave: '選舉假',
  other: '其他',
}

export const WORK_LOG_TYPE_LABELS: Record<Enums<'work_log_type'>, string> = {
  production: '製作',
  learning: '學習',
}
