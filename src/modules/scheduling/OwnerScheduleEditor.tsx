import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthCalendarGrid, type DayCell } from './MonthCalendarGrid'
import { MonthSelector } from '@/shared/components/MonthSelector'
import { Legend } from './Legend'
import { useSchedulePublications, type PublicationSnapshotEntry } from './usePublications'
import { useWeekStart } from './useWeekStart'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { fetchCarryInStreak } from './consecutiveWorkDays'
import {
  checkMaxConsecutiveWorkDays,
  checkWeeklyRestCompliance,
  daysInMonth,
  defaultSchedulingYearMonth,
  pad2,
  todayStr,
} from '@/shared/lib/date'
import { CALENDAR_OVERRIDE_FULL_MASK, SHIFT_STATUS_LABELS } from '@/shared/constants/roles'
import type { Enums, Tables } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>
type OverrideType = Enums<'calendar_override_type'>
type Profile = Tables<'profiles'>
type OverrideInfo = { name: string; type: OverrideType }

const BRUSH_OPTIONS: ShiftStatus[] = ['normal', 'regular_off', 'special_off', 'unscheduled']
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

function statusMapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => a[k] === b[k])
}

export function OwnerScheduleEditor() {
  const { session, profile } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [savedStatus, setSavedStatus] = useState<Record<string, ShiftStatus>>({})
  const [preferenceMap, setPreferenceMap] = useState<Record<string, 'prefer_work' | 'prefer_off'>>({})
  const [overridesMap, setOverridesMap] = useState<Record<string, OverrideInfo>>({})
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [brush, setBrush] = useState<ShiftStatus>('normal')
  const [carryInStreak, setCarryInStreak] = useState(0)
  const loadSeq = useRef(0)
  // Supabase Realtime's DELETE payload only ever carries the primary key
  // (id), never the rest of the row, even with REPLICA IDENTITY FULL — so we
  // keep our own id -> work_date maps (built from load() + INSERT/UPDATE
  // events) to resolve which cell a DELETE is for.
  const scheduleIdMap = useRef<Record<string, string>>({})
  const preferenceIdMap = useRef<Record<string, string>>({})

  const [year, month] = yearMonth.split('-').map(Number)
  const {
    publications,
    loading: publicationsLoading,
    reload: reloadPublications,
    setPublications,
  } = useSchedulePublications(selectedMemberId || undefined, yearMonth)

  const selectedMember = members.find((m) => m.id === selectedMemberId)
  const { weekStartWeekday, shiftWeekStart } = useWeekStart(
    selectedMemberId || undefined,
    yearMonth,
    selectedMember?.hire_date
  )
  const { settings: orgSettings } = useOrgSettings()
  const appliedDefaultMonth = useRef(false)

  useEffect(() => {
    if (appliedDefaultMonth.current || !orgSettings) return
    appliedDefaultMonth.current = true
    setYearMonth(defaultSchedulingYearMonth(orgSettings.default_next_month_after_25))
  }, [orgSettings])

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .neq('role', 'guest')
      .order('display_name')
      .then(({ data }) => {
        setMembers(data ?? [])
        setSelectedMemberId((prev) => prev || profile?.id || data?.[0]?.id || '')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedMemberId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, yearMonth])

  useEffect(() => {
    if (!selectedMemberId) {
      setCarryInStreak(0)
      return
    }
    fetchCarryInStreak({
      memberId: selectedMemberId,
      yearMonth,
      hireDate: selectedMember?.hire_date,
      source: 'draft',
    }).then(setCarryInStreak)
  }, [selectedMemberId, yearMonth, selectedMember?.hire_date])

  // realtime: keep 暫態 in sync across owner sessions editing the same member+month
  useEffect(() => {
    if (!selectedMemberId) return
    const channel = supabase
      .channel(`schedules-${selectedMemberId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules', filter: `member_id=eq.${selectedMemberId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // Realtime's DELETE payload.old only ever has the id, never work_date —
            // resolve it from our own id map (populated by load()/INSERT/UPDATE)
            const id = (payload.old as { id?: string } | null)?.id
            const workDate = id ? scheduleIdMap.current[id] : undefined
            if (!workDate || !workDate.startsWith(yearMonth)) return
            delete scheduleIdMap.current[id as string]
            setSavedStatus((prev) => {
              const next = { ...prev }
              delete next[workDate]
              return next
            })
            return
          }
          const row = payload.new as { id: string; work_date?: string; status?: ShiftStatus } | null
          if (!row?.work_date || !row.work_date.startsWith(yearMonth)) return
          scheduleIdMap.current[row.id] = row.work_date
          if (row.status) {
            setSavedStatus((prev) => ({ ...prev, [row.work_date as string]: row.status as ShiftStatus }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedMemberId, yearMonth])

  // realtime: keep the 排班喜好 hint border in sync as the member checks/unchecks it
  useEffect(() => {
    if (!selectedMemberId) return
    const channel = supabase
      .channel(`schedule_preferences-${selectedMemberId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_preferences',
          filter: `member_id=eq.${selectedMemberId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // Realtime's DELETE payload.old only ever has the id, never work_date —
            // resolve it from our own id map (populated by load()/INSERT/UPDATE)
            const id = (payload.old as { id?: string } | null)?.id
            const workDate = id ? preferenceIdMap.current[id] : undefined
            if (!workDate || !workDate.startsWith(yearMonth)) return
            delete preferenceIdMap.current[id as string]
            setPreferenceMap((prev) => {
              const next = { ...prev }
              delete next[workDate]
              return next
            })
            return
          }
          const row = payload.new as
            | { id: string; work_date?: string; preference?: 'prefer_work' | 'prefer_off' }
            | null
          if (!row?.work_date || !row.work_date.startsWith(yearMonth)) return
          preferenceIdMap.current[row.id] = row.work_date
          if (row.preference) {
            setPreferenceMap((prev) => ({ ...prev, [row.work_date as string]: row.preference as 'prefer_work' | 'prefer_off' }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedMemberId, yearMonth])

  // realtime: refresh publication status when anyone publishes for this member (any month)
  useEffect(() => {
    if (!selectedMemberId) return
    const channel = supabase
      .channel(`schedule_publications-${selectedMemberId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_publications',
          filter: `member_id=eq.${selectedMemberId}`,
        },
        () => reloadPublications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId])

  const load = async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    setMessage(null)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

    const [{ data: scheduleRows }, { data: overrideRows }, { data: preferenceRows }] = await Promise.all([
      supabase
        .from('schedules')
        .select('id, work_date, status')
        .eq('member_id', selectedMemberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('calendar_overrides')
        .select('override_date, name, type')
        .gte('override_date', firstDay)
        .lte('override_date', lastDay),
      supabase
        .from('schedule_preferences')
        .select('id, work_date, preference')
        .eq('member_id', selectedMemberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
    ])

    // a newer load may have started (e.g. yearMonth/selectedMemberId changed again
    // while this one was in flight) — discard this result so it can't clobber
    // fresher state with a different month's data
    if (seq !== loadSeq.current) return

    const overrides: Record<string, OverrideInfo> = {}
    for (const o of overrideRows ?? []) overrides[o.override_date] = { name: o.name, type: o.type }
    setOverridesMap(overrides)

    const statusMap: Record<string, ShiftStatus> = {}
    const scheduleIds: Record<string, string> = {}
    for (const row of scheduleRows ?? []) {
      statusMap[row.work_date] = row.status
      scheduleIds[row.id] = row.work_date
    }
    setSavedStatus(statusMap)
    scheduleIdMap.current = scheduleIds

    const prefMap: Record<string, 'prefer_work' | 'prefer_off'> = {}
    const prefIds: Record<string, string> = {}
    for (const row of preferenceRows ?? []) {
      prefMap[row.work_date] = row.preference
      prefIds[row.id] = row.work_date
    }
    setPreferenceMap(prefMap)
    preferenceIdMap.current = prefIds

    setLoading(false)
  }

  const isFullMaskDate = (date: string) => {
    const ov = overridesMap[date]
    return !!ov && CALENDAR_OVERRIDE_FULL_MASK[ov.type]
  }

  const applyBrush = async (date: string) => {
    if (isFullMaskDate(date)) return
    if (selectedMember?.hire_date && date < selectedMember.hire_date) return
    if (orgSettings?.block_past_scheduling && date < todayStr()) return
    if (!session || !selectedMemberId) return

    const previous = savedStatus[date]
    setSavedStatus((prev) => ({ ...prev, [date]: brush }))
    const { error } = await supabase.from('schedules').upsert(
      {
        member_id: selectedMemberId,
        work_date: date,
        status: brush,
        created_by: session.user.id,
        updated_by: session.user.id,
      },
      { onConflict: 'member_id,work_date' }
    )
    if (error) {
      setSavedStatus((prev) => ({ ...prev, [date]: previous }))
      setMessage(`儲存失敗：${error.message}`)
    }
  }

  const handlePublish = async () => {
    if (!session || !selectedMemberId) return
    setPublishing(true)
    setMessage(null)

    const rows = Object.entries(savedStatus)
      .filter(([date]) => !isFullMaskDate(date))
      .map(([work_date, status]) => ({ work_date, status }))

    const { data: inserted, error } = await supabase
      .from('schedule_publications')
      .insert({
        member_id: selectedMemberId,
        year_month: `${yearMonth}-01`,
        published_by: session.user.id,
        snapshot: rows,
      })
      .select()
      .single()
    setPublishing(false)
    if (error) {
      setMessage(`公告失敗：${error.message}`)
      return
    }
    setMessage('已公告給使用者')
    // update local state immediately rather than waiting on a refetch/realtime
    // round-trip, so the status line and buttons below reflect it right away
    if (inserted) {
      setPublications((prev) => [
        { ...inserted, published_by_name: profile?.display_name },
        ...prev,
      ])
    }
    reloadPublications()
  }

  const cells: Record<string, DayCell> = {}
  for (const [date, status] of Object.entries(savedStatus)) {
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
    savedStatus,
    selectedMember?.hire_date
  )
  const isConsecutiveCompliant = checkMaxConsecutiveWorkDays(year, month, savedStatus, carryInStreak)

  const currentSnapshotMap = Object.fromEntries(
    Object.entries(savedStatus).filter(([date]) => !isFullMaskDate(date))
  )
  const latestPub = publications[0]
  const latestPubMap = latestPub
    ? Object.fromEntries(
        ((latestPub.snapshot as PublicationSnapshotEntry[] | null) ?? []).map((e) => [e.work_date, e.status])
      )
    : null
  const publishStatus: 'none' | 'synced' | 'drifted' = !latestPub
    ? 'none'
    : statusMapsEqual(currentSnapshotMap, latestPubMap!)
      ? 'synced'
      : 'drifted'

  const handleRevert = async () => {
    if (!session || !selectedMemberId || !latestPub) return
    setReverting(true)
    setMessage(null)

    const publishedEntries = (latestPub.snapshot as PublicationSnapshotEntry[] | null) ?? []
    const publishedMap: Record<string, ShiftStatus> = Object.fromEntries(
      publishedEntries.map((e) => [e.work_date, e.status])
    )
    const datesToDelete = Object.keys(currentSnapshotMap).filter((d) => !(d in publishedMap))

    const [{ error: upsertError }, { error: deleteError }] = await Promise.all([
      publishedEntries.length > 0
        ? supabase.from('schedules').upsert(
            publishedEntries.map((e) => ({
              member_id: selectedMemberId,
              work_date: e.work_date,
              status: e.status,
              created_by: session.user.id,
              updated_by: session.user.id,
            })),
            { onConflict: 'member_id,work_date' }
          )
        : { error: null },
      datesToDelete.length > 0
        ? supabase.from('schedules').delete().eq('member_id', selectedMemberId).in('work_date', datesToDelete)
        : { error: null },
    ])

    setReverting(false)
    if (upsertError || deleteError) {
      setMessage(`還原失敗：${(upsertError ?? deleteError)?.message}`)
      return
    }
    setSavedStatus(publishedMap)
  }

  return (
    <div>
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
        {selectedMember && (
          <div className="text-sm text-gray-600">
            約定每日工時：{selectedMember.default_daily_hours} 小時
            {selectedMember.hire_date && <span className="ml-2">到職日：{selectedMember.hire_date}</span>}
          </div>
        )}
      </div>

      {message && <p className="text-sm mb-3 text-green-700">{message}</p>}

      {loading || publicationsLoading ? (
        <div>載入中…</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-2">
            {BRUSH_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={brush === s}
                onClick={() => setBrush(s)}
                className={`px-3 py-1.5 rounded text-sm border transition ${
                  brush === s
                    ? 'bg-black text-white border-black ring-2 ring-offset-1 ring-black'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {SHIFT_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-2">
            先選上面的班別狀態，再點下面日期套用該狀態，每次點擊會立即儲存，但不會公告給該成員
          </p>
          <p className="text-xs text-gray-500 mb-2">
            格子邊框顯示綠色/紅色細框，代表該成員填寫的排班喜好（偏好上班／偏好放假），僅供參考，不影響實際排班
          </p>

          {orgSettings?.show_color_legend && <Legend />}
          <div className="mb-2">
            <MonthSelector value={yearMonth} onChange={setYearMonth} centered />
          </div>
          <MonthCalendarGrid
            year={year}
            month={month}
            cells={cells}
            onDayClick={applyBrush}
            weekStartWeekday={showWeekStart ? weekStartWeekday : undefined}
            minDate={selectedMember?.hire_date}
            readOnlyBefore={orgSettings?.block_past_scheduling ? todayStr() : undefined}
            preferenceMap={preferenceMap}
          />

          {showWeekStart && (
            <>
              {orgSettings?.enable_week_start_adjust && (
                <div className="flex items-center justify-center gap-3 mt-3 text-sm">
                  <button
                    onClick={() => shiftWeekStart(-1, session?.user.id)}
                    className="border rounded px-2 py-0.5"
                  >
                    &lt;
                  </button>
                  <span className="text-gray-600">切換周起始：{WEEKDAY_NAMES[weekStartWeekday]}</span>
                  <button
                    onClick={() => shiftWeekStart(1, session?.user.id)}
                    className="border rounded px-2 py-0.5"
                  >
                    &gt;
                  </button>
                </div>
              )}

              {isCompliant && isConsecutiveCompliant ? (
                <p className="text-sm mt-2 text-green-700">All good, 本月符合一例一休！</p>
              ) : (
                <>
                  {!isCompliant && (
                    <p className="text-sm mt-2 text-red-600 font-medium">
                      Error &gt;&gt; 本月有完整周缺失一例一休，請檢查！
                    </p>
                  )}
                  {!isConsecutiveCompliant && (
                    <p className="text-sm mt-2 text-red-600 font-medium">
                      Error &gt;&gt; 不可連續工作超過六天，請檢查！
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              {publishStatus === 'none' && (
                <p className="text-sm text-red-600">&lt;本月尚未公告給使用者&gt;</p>
              )}
              {publishStatus === 'synced' && (
                <p className="text-sm text-green-700">&lt;本月已公告且當前編輯為最新狀態&gt;</p>
              )}
            </div>
            {publishStatus !== 'synced' && (
              <div className="flex gap-2">
                {publications.length > 0 && (
                  <button
                    onClick={handleRevert}
                    disabled={reverting}
                    className="bg-white text-gray-700 border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {reverting ? '還原中…' : '還原回最後一版公告'}
                  </button>
                )}
                <button
                  onClick={handlePublish}
                  disabled={publishing || loading || (showWeekStart && (!isCompliant || !isConsecutiveCompliant))}
                  title={
                    showWeekStart && (!isCompliant || !isConsecutiveCompliant)
                      ? '請先修正上方一例一休/連續工作日的錯誤，才能公告給使用者'
                      : undefined
                  }
                  className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
                >
                  {publishing ? '公告中…' : '>>公告給使用者'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
