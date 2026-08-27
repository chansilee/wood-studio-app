import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthCalendarGrid, type DayCell } from './MonthCalendarGrid'
import { MonthSelector } from '@/shared/components/MonthSelector'
import { Legend } from './Legend'
import { PublicationStatusLine } from './PublicationStatusLine'
import { useSchedulePublications, type PublicationSnapshotEntry } from './usePublications'
import { useScheduleConfirmation } from './useScheduleConfirmation'
import { useWeekStart } from './useWeekStart'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { fetchCarryInStreak } from './consecutiveWorkDays'
import {
  checkMaxConsecutiveWorkDays,
  checkWeeklyRestCompliance,
  daysInMonth,
  defaultSchedulingYearMonth,
  formatDateTime,
  pad2,
  todayStr,
} from '@/shared/lib/date'
import { CALENDAR_OVERRIDE_FULL_MASK } from '@/shared/constants/roles'
import type { Enums, Tables } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>
type OverrideType = Enums<'calendar_override_type'>
type Profile = Tables<'profiles'>
type OverrideInfo = { name: string; type: OverrideType }

export function BrowseScheduleView() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [overridesMap, setOverridesMap] = useState<Record<string, OverrideInfo>>({})
  const [loading, setLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [carryInStreak, setCarryInStreak] = useState(0)
  const loadSeq = useRef(0)

  const [year, month] = yearMonth.split('-').map(Number)
  const memberId = isOwner ? selectedMemberId : (profile?.id ?? '')
  const { publications } = useSchedulePublications(memberId || undefined, yearMonth)
  const selectedMember = isOwner ? members.find((m) => m.id === memberId) : profile
  const { weekStartWeekday } = useWeekStart(memberId || undefined, yearMonth, selectedMember?.hire_date)
  const { settings: orgSettings } = useOrgSettings()
  const appliedDefaultMonth = useRef(false)

  useEffect(() => {
    if (appliedDefaultMonth.current || !orgSettings) return
    appliedDefaultMonth.current = true
    setYearMonth(defaultSchedulingYearMonth(orgSettings.default_next_month_after_25))
  }, [orgSettings])

  const latestPublication = publications[0]
  const {
    confirmed,
    confirmedAt,
    loading: confirmationLoading,
    reload: reloadConfirmation,
  } = useScheduleConfirmation(latestPublication?.id)

  useEffect(() => {
    if (!isOwner || !profile) return
    supabase
      .from('profiles')
      .select('*')
      .neq('role', 'guest')
      .order('display_name')
      .then(({ data }) => {
        setMembers(data ?? [])
        setSelectedMemberId((prev) => prev || profile.id)
      })
  }, [isOwner, profile])

  useEffect(() => {
    if (!memberId) return
    setViewingId(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, yearMonth])

  useEffect(() => {
    if (!memberId) {
      setCarryInStreak(0)
      return
    }
    fetchCarryInStreak({
      memberId,
      yearMonth,
      hireDate: selectedMember?.hire_date,
      source: 'published',
    }).then(setCarryInStreak)
  }, [memberId, yearMonth, selectedMember?.hire_date])

  const load = async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

    const { data: overrideRows } = await supabase
      .from('calendar_overrides')
      .select('override_date, name, type')
      .gte('override_date', firstDay)
      .lte('override_date', lastDay)

    // a newer load may have started while this one was in flight — discard this
    // result so it can't clobber fresher state with a different month's data
    if (seq !== loadSeq.current) return

    const overrides: Record<string, OverrideInfo> = {}
    for (const o of overrideRows ?? []) overrides[o.override_date] = { name: o.name, type: o.type }
    setOverridesMap(overrides)

    setLoading(false)
  }

  const isViewingLatest = !viewingId || (latestPublication && viewingId === latestPublication.id)
  const activePublication = viewingId ? publications.find((p) => p.id === viewingId) : latestPublication
  const displayStatus: Record<string, ShiftStatus> = Object.fromEntries(
    ((activePublication?.snapshot as PublicationSnapshotEntry[] | null) ?? []).map((e) => [
      e.work_date,
      e.status,
    ])
  )

  const cells: Record<string, DayCell> = {}
  for (const [date, status] of Object.entries(displayStatus)) {
    cells[date] = { status }
  }
  for (const [date, ov] of Object.entries(overridesMap)) {
    const fullMask = CALENDAR_OVERRIDE_FULL_MASK[ov.type]
    cells[date] = {
      status: fullMask ? 'unscheduled' : (cells[date]?.status ?? 'unscheduled'),
      overrideName: ov.name,
      overrideFullMask: fullMask,
    }
  }

  const showWeekStart = !!selectedMember?.hire_date && !!selectedMember?.weekly_rest_check_enabled
  const isCompliant = checkWeeklyRestCompliance(
    year,
    month,
    weekStartWeekday,
    displayStatus,
    selectedMember?.hire_date
  )
  const isConsecutiveCompliant = checkMaxConsecutiveWorkDays(year, month, displayStatus, carryInStreak)
  const isOwnSchedule = !!profile && memberId === profile.id

  const handleConfirm = async () => {
    if (!profile || !latestPublication) return
    setConfirming(true)
    const { error } = await supabase
      .from('schedule_confirmations')
      .insert({ publication_id: latestPublication.id, member_id: profile.id })
    setConfirming(false)
    if (!error) reloadConfirmation()
  }

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
                  {m.display_name}
                  {m.id === profile?.id ? '（我）' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="mb-4">
        <MonthSelector value={yearMonth} onChange={setYearMonth} centered />
      </div>

      {loading ? (
        <div>載入中…</div>
      ) : (
        <>
          <PublicationStatusLine publications={publications} viewingId={viewingId} onChange={setViewingId} />
          {publications.length > 0 && (
            <>
              {orgSettings?.show_color_legend && <Legend />}
              <MonthCalendarGrid
                year={year}
                month={month}
                cells={cells}
                weekStartWeekday={showWeekStart ? weekStartWeekday : undefined}
              />

              {(showWeekStart || (isOwnSchedule && isViewingLatest && !confirmationLoading)) && (
                <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                  <div>
                    {showWeekStart &&
                      (isCompliant && isConsecutiveCompliant ? (
                        <p className="text-sm text-green-700">All good, 本月符合一例一休！</p>
                      ) : (
                        <>
                          {!isCompliant && (
                            <p className="text-sm text-red-600 font-medium">
                              Error &gt;&gt; 本月有完整周缺失一例一休，請檢查！
                            </p>
                          )}
                          {!isConsecutiveCompliant && (
                            <p className="text-sm text-red-600 font-medium">
                              Error &gt;&gt; 不可連續工作超過六天，請檢查！
                            </p>
                          )}
                        </>
                      ))}
                  </div>
                  <div>
                    {isOwnSchedule && isViewingLatest && !confirmationLoading && (
                      confirmed ? (
                        <span className="text-sm text-green-700">
                          ({confirmedAt ? formatDateTime(confirmedAt) : ''} 已確認此排班)
                        </span>
                      ) : (
                        <button
                          onClick={handleConfirm}
                          disabled={confirming}
                          className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                        >
                          {confirming ? '確認中…' : '>> 我已瀏覽並確認此排班'}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
