import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { useSchedulePublications, type PublicationSnapshotEntry } from '@/modules/scheduling/usePublications'
import { daysInMonth, getMonthGrid, pad2, todayStr } from '@/shared/lib/date'
import { LeaveDetailPanel } from './LeaveDetailPanel'
import { MonthSelector } from '@/shared/components/MonthSelector'
import { computeLeaveDisplay } from './leaveDisplay'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { isSelectableMember } from '@/shared/lib/members'
import { isMonthSettled, MONTH_SETTLED_MESSAGE } from '@/shared/lib/settlementLock'
import type { Enums, Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>
type LeaveType = Tables<'leave_types'>
type LeaveRequestRow = Tables<'leave_requests'> & {
  leave_type_name?: string
  leave_type_pay_coefficient?: number
  reviewer_name?: string
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export function LeaveCalendar() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, { status: string; hours: number | null; clockInAt: string | null; clockOutAt: string | null }>
  >({})
  const [leaveMap, setLeaveMap] = useState<Record<string, LeaveRequestRow>>({})
  const [defaultDailyHours, setDefaultDailyHours] = useState(6)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [monthSettled, setMonthSettled] = useState(false)

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
        const selectable = (data ?? []).filter(isSelectableMember)
        setMembers(selectable)
        setSelectedMemberId((prev) => prev || (selectable.some((m) => m.id === profile.id) ? profile.id : selectable[0]?.id) || '')
      })
  }, [isOwner, profile])

  useEffect(() => {
    supabase
      .from('leave_types')
      .select('*')
      .eq('hidden_from_members', false)
      .order('created_at')
      .then(({ data }) => setLeaveTypes(data ?? []))
  }, [])

  useEffect(() => {
    if (!memberId) return
    supabase
      .from('profiles')
      .select('default_daily_hours')
      .eq('id', memberId)
      .single()
      .then(({ data }) => setDefaultDailyHours(Number(data?.default_daily_hours ?? 6)))
  }, [memberId])

  // switching member/month is a real context change (reset selection + show
  // the loading state); a refreshKey bump after an action (submit/approve/
  // reject/delete) should just quietly refetch in place — toggling `loading`
  // there would unmount the whole grid and flash back to the collapsed view,
  // and resetting selectedDate would close the panel the user just acted in
  const memberMonthKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!memberId) return
    const key = `${memberId}::${yearMonth}`
    const isNewContext = memberMonthKeyRef.current !== key
    memberMonthKeyRef.current = key
    if (isNewContext) {
      setSelectedDate(null)
      load()
    } else {
      fetchAndApply()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, yearMonth, refreshKey])

  useEffect(() => {
    if (!memberId) {
      setMonthSettled(false)
      return
    }
    isMonthSettled(memberId, yearMonth).then(setMonthSettled)
  }, [memberId, yearMonth, refreshKey])

  const fetchAndApply = async () => {
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

    const [{ data: attRows }, { data: leaveRows }] = await Promise.all([
      supabase
        .from('attendance_summary')
        .select('work_date, attendance_status, worked_hours, clock_in_at, clock_out_at')
        .eq('member_id', memberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('leave_requests')
        .select('*, leave_types(name, pay_coefficient)')
        .eq('member_id', memberId)
        .gte('leave_date', firstDay)
        .lte('leave_date', lastDay),
    ])

    const aMap: Record<
      string,
      { status: string; hours: number | null; clockInAt: string | null; clockOutAt: string | null }
    > = {}
    for (const r of attRows ?? []) {
      if (r.work_date) {
        aMap[r.work_date] = {
          status: r.attendance_status ?? 'abnormal',
          hours: r.worked_hours,
          clockInAt: r.clock_in_at,
          clockOutAt: r.clock_out_at,
        }
      }
    }
    setAttendanceMap(aMap)

    const rows = (leaveRows ?? []) as Array<
      Tables<'leave_requests'> & { leave_types: { name: string; pay_coefficient: number } | null }
    >
    const reviewerIds = Array.from(
      new Set(rows.map((r) => r.reviewed_by).filter((id): id is string => !!id))
    )
    let names: Record<string, string> = {}
    if (reviewerIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, preferred_display_name')
        .in('id', reviewerIds)
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)]))
    }

    const lMap: Record<string, LeaveRequestRow> = {}
    for (const r of rows) {
      lMap[r.leave_date] = {
        ...r,
        leave_type_name: r.leave_types?.name,
        leave_type_pay_coefficient: r.leave_types?.pay_coefficient,
        reviewer_name: r.reviewed_by ? names[r.reviewed_by] : undefined,
      }
    }
    setLeaveMap(lMap)
  }

  const load = async () => {
    setLoading(true)
    await fetchAndApply()
    setLoading(false)
  }

  const scheduleMap = useMemo(() => {
    const map: Record<string, Enums<'shift_status'>> = {}
    const snapshot = (latestSnapshot?.snapshot as PublicationSnapshotEntry[] | undefined) ?? []
    for (const e of snapshot) map[e.work_date] = e.status
    return map
  }, [latestSnapshot])

  const today = todayStr()
  const weeks = getMonthGrid(year, month)
  const bump = () => setRefreshKey((k) => k + 1)

  const selectedMember = isOwner ? members.find((m) => m.id === memberId) : profile

  return (
    <div>
      {isOwner && (
        <div className="flex flex-wrap items-end gap-3 mb-4">
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
        </div>
      )}

      <div className="mb-3">
        <MonthSelector value={yearMonth} onChange={setYearMonth} centered />
      </div>

      <p className="text-xs text-gray-500 mb-3">
        月曆依「最新公告」的排班為準；正常班的日期都可以點選申報假別，尚未出勤（含今日結算前）的日期會先顯示「尚未出勤」。
      </p>

      {monthSettled && (
        <p className="text-red-600 text-sm font-medium mb-3 border border-red-200 bg-red-50 rounded px-3 py-2">
          {MONTH_SETTLED_MESSAGE}
        </p>
      )}

      {selectedDate &&
        selectedMember &&
        (() => {
          const selectedIsPast = selectedDate < today
          const selectedRawStatus =
            (attendanceMap[selectedDate]?.status as 'normal' | 'abnormal') ?? 'abnormal'
          const selectedClockInAt = attendanceMap[selectedDate]?.clockInAt ?? null
          const selectedClockOutAt = attendanceMap[selectedDate]?.clockOutAt ?? null
          return (
            <LeaveDetailPanel
              date={selectedDate}
              memberId={memberId}
              isOwner={isOwner}
              isPast={selectedIsPast}
              canDeclare={memberId === profile?.id && !leaveMap[selectedDate] && !monthSettled}
              canUseManagerOverride={
                isOwner &&
                !leaveMap[selectedDate] &&
                selectedIsPast &&
                selectedRawStatus === 'abnormal' &&
                !!selectedClockInAt &&
                !!selectedClockOutAt &&
                !monthSettled
              }
              monthSettled={monthSettled}
              leaveRequest={leaveMap[selectedDate]}
              rawHours={attendanceMap[selectedDate]?.hours ?? null}
              clockInAt={selectedClockInAt}
              clockOutAt={selectedClockOutAt}
              defaultDailyHours={defaultDailyHours}
              leaveTypes={leaveTypes}
              onChanged={() => {
                bump()
              }}
              onClose={() => setSelectedDate(null)}
            />
          )
        })()}

      {loading ? (
        <div>載入中…</div>
      ) : (
        <div className="border rounded overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 text-xs text-gray-500">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="p-2 text-center border-b">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="border p-2 h-20 bg-gray-50" />
                const day = Number(date.slice(-2))
                const shiftStatus = scheduleMap[date] ?? 'unscheduled'

                if (shiftStatus !== 'normal') {
                  return (
                    <div key={di} className="border p-1 h-20 text-xs text-gray-300">
                      {day}
                    </div>
                  )
                }

                const isPast = date < today
                const leaveReq = leaveMap[date]
                const rawStatus = (attendanceMap[date]?.status as 'normal' | 'abnormal') ?? 'abnormal'

                const { primaryLabel, secondaryLabel, colorClass, clickable } = computeLeaveDisplay({
                  isPast,
                  rawStatus,
                  rawHours: attendanceMap[date]?.hours ?? null,
                  defaultDailyHours,
                  leaveRequest: leaveReq,
                })

                return (
                  <button
                    key={di}
                    type="button"
                    disabled={!clickable}
                    onClick={() => setSelectedDate(date)}
                    className={`border p-1 h-20 text-left flex flex-col ${colorClass} ${
                      clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'
                    }`}
                  >
                    <span className="text-xs text-gray-500">{day}</span>
                    {primaryLabel && (
                      <span className="text-[11px] font-medium mt-1 break-words">{primaryLabel}</span>
                    )}
                    {secondaryLabel && (
                      <span className="text-[11px] font-medium break-words">{secondaryLabel}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
