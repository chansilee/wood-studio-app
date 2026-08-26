import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthCalendarGrid, type DayCell } from './MonthCalendarGrid'
import { Legend } from './Legend'
import { PublicationBar } from './PublicationBar'
import { useSchedulePublications, type PublicationSnapshotEntry } from './usePublications'
import { useWeekStart } from './useWeekStart'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { checkWeeklyRestCompliance, daysInMonth, pad2, todayStr } from '@/shared/lib/date'
import { SHIFT_STATUS_LABELS } from '@/shared/constants/roles'
import type { Enums, Tables } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>
type Profile = Tables<'profiles'>

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
  const [overridesMap, setOverridesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [brush, setBrush] = useState<ShiftStatus>('normal')
  const [viewingId, setViewingId] = useState<string | 'live'>('live')

  const [year, month] = yearMonth.split('-').map(Number)
  const { publications, reload: reloadPublications } = useSchedulePublications(
    selectedMemberId || undefined,
    yearMonth
  )

  const selectedMember = members.find((m) => m.id === selectedMemberId)
  const { weekStartWeekday, shiftWeekStart } = useWeekStart(
    selectedMemberId || undefined,
    yearMonth,
    selectedMember?.hire_date
  )
  const { settings: orgSettings } = useOrgSettings()

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
    setViewingId('live')
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, yearMonth])

  // realtime: keep 暫態 in sync across owner sessions editing the same member+month
  useEffect(() => {
    if (!selectedMemberId) return
    const channel = supabase
      .channel(`schedules-${selectedMemberId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules', filter: `member_id=eq.${selectedMemberId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { work_date?: string; status?: ShiftStatus } | null
          if (!row?.work_date || !row.work_date.startsWith(yearMonth)) return
          if (payload.eventType === 'DELETE') {
            setSavedStatus((prev) => {
              const next = { ...prev }
              delete next[row.work_date as string]
              return next
            })
          } else if (row.status) {
            setSavedStatus((prev) => ({ ...prev, [row.work_date as string]: row.status as ShiftStatus }))
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
    setLoading(true)
    setMessage(null)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

    const [{ data: scheduleRows }, { data: overrideRows }] = await Promise.all([
      supabase
        .from('schedules')
        .select('work_date, status')
        .eq('member_id', selectedMemberId)
        .gte('work_date', firstDay)
        .lte('work_date', lastDay),
      supabase
        .from('calendar_overrides')
        .select('override_date, name')
        .gte('override_date', firstDay)
        .lte('override_date', lastDay),
    ])

    const overrides: Record<string, string> = {}
    for (const o of overrideRows ?? []) overrides[o.override_date] = o.name
    setOverridesMap(overrides)

    const statusMap: Record<string, ShiftStatus> = {}
    for (const row of scheduleRows ?? []) statusMap[row.work_date] = row.status
    setSavedStatus(statusMap)

    setLoading(false)
  }

  const applyBrush = async (date: string) => {
    if (overridesMap[date]) return
    if (viewingId !== 'live') return
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
      .filter(([date]) => !overridesMap[date])
      .map(([work_date, status]) => ({ work_date, status }))

    const { error } = await supabase.from('schedule_publications').insert({
      member_id: selectedMemberId,
      year_month: `${yearMonth}-01`,
      published_by: session.user.id,
      snapshot: rows,
    })
    setPublishing(false)
    if (error) {
      setMessage(`公告失敗：${error.message}`)
      return
    }
    setMessage('已公告給使用者')
    reloadPublications()
  }

  const viewingPublication = viewingId === 'live' ? null : publications.find((p) => p.id === viewingId)
  const displayStatus: Record<string, ShiftStatus> =
    viewingId === 'live'
      ? savedStatus
      : Object.fromEntries(
          ((viewingPublication?.snapshot as PublicationSnapshotEntry[] | null) ?? []).map((e) => [
            e.work_date,
            e.status,
          ])
        )

  const cells: Record<string, DayCell> = {}
  for (const [date, status] of Object.entries(displayStatus)) {
    cells[date] = { status }
  }
  for (const [date, name] of Object.entries(overridesMap)) {
    cells[date] = { status: 'unscheduled', overrideName: name }
  }

  const editing = viewingId === 'live'
  const showWeekStart = !!selectedMember?.hire_date && !!selectedMember?.weekly_rest_check_enabled
  const isCompliant = checkWeeklyRestCompliance(year, month, weekStartWeekday, displayStatus)

  const currentSnapshotMap = Object.fromEntries(
    Object.entries(savedStatus).filter(([date]) => !overridesMap[date])
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
        <div>
          <label className="block text-xs text-gray-600 mb-1">月份</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
        {selectedMember && (
          <div className="text-sm text-gray-600">
            約定每日工時：{selectedMember.default_daily_hours} 小時
            {selectedMember.hire_date && <span className="ml-2">到職日：{selectedMember.hire_date}</span>}
          </div>
        )}
      </div>

      {message && <p className="text-sm mb-3 text-green-700">{message}</p>}

      {loading ? (
        <div>載入中…</div>
      ) : (
        <>
          <PublicationBar
            publications={publications}
            viewingId={viewingId}
            onChange={setViewingId}
            editable
          />

          <div className="flex flex-wrap gap-2 mb-2">
            {BRUSH_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!editing}
                aria-pressed={brush === s}
                onClick={() => setBrush(s)}
                className={`px-3 py-1.5 rounded text-sm border transition disabled:opacity-40 ${
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
            {editing ? '先選上面的班別狀態，再點下面日期套用該狀態，每次點擊會立即儲存為暫態' : ''}
          </p>

          <Legend />
          <MonthCalendarGrid
            year={year}
            month={month}
            cells={cells}
            onDayClick={editing ? applyBrush : undefined}
            weekStartWeekday={showWeekStart ? weekStartWeekday : undefined}
            minDate={selectedMember?.hire_date}
            readOnlyBefore={orgSettings?.block_past_scheduling ? todayStr() : undefined}
          />

          {showWeekStart && (
            <>
              <div className="flex items-center gap-2 mt-3 text-sm">
                <span className="text-gray-600">切換周起始：{WEEKDAY_NAMES[weekStartWeekday]}</span>
                <button
                  onClick={() => shiftWeekStart(-1, session?.user.id)}
                  disabled={!editing}
                  className="border rounded px-2 py-0.5 disabled:opacity-40"
                >
                  &lt;
                </button>
                <button
                  onClick={() => shiftWeekStart(1, session?.user.id)}
                  disabled={!editing}
                  className="border rounded px-2 py-0.5 disabled:opacity-40"
                >
                  &gt;
                </button>
              </div>

              <p className={`text-sm mt-2 ${isCompliant ? 'text-green-700' : 'text-red-600 font-medium'}`}>
                {isCompliant ? '本月符合一例一休！' : '本月有完整周缺失一例一休，請檢查！'}
              </p>
            </>
          )}

          {editing && (
            <div className="mt-4">
              <p
                className={`text-sm mb-1 ${
                  publishStatus === 'none'
                    ? 'text-red-600'
                    : publishStatus === 'synced'
                      ? 'text-green-700'
                      : 'text-orange-600'
                }`}
              >
                {publishStatus === 'none'
                  ? '<本月尚未公告給使用者>'
                  : publishStatus === 'synced'
                    ? '<本月已公告且當前暫態為最新狀態>'
                    : '<當前暫態有更新未同步於最新公告>'}
              </p>
              <button
                onClick={handlePublish}
                disabled={publishing || loading}
                className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                {publishing ? '公告中…' : '公告給使用者'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
