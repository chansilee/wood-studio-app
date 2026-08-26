import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { MonthCalendarGrid, type DayCell } from './MonthCalendarGrid'
import { Legend } from './Legend'
import { PublicationStatusLine } from './PublicationStatusLine'
import { useSchedulePublications, type PublicationSnapshotEntry } from './usePublications'
import { useScheduleConfirmation } from './useScheduleConfirmation'
import { useWeekStart } from './useWeekStart'
import { checkWeeklyRestCompliance, daysInMonth, formatDateTime, pad2, todayStr } from '@/shared/lib/date'
import type { Enums, Tables } from '@/shared/types/database'

type ShiftStatus = Enums<'shift_status'>
type Profile = Tables<'profiles'>

export function BrowseScheduleView() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [yearMonth, setYearMonth] = useState(todayStr().slice(0, 7))
  const [overridesMap, setOverridesMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const [year, month] = yearMonth.split('-').map(Number)
  const memberId = isOwner ? selectedMemberId : (profile?.id ?? '')
  const { publications } = useSchedulePublications(memberId || undefined, yearMonth)
  const selectedMember = isOwner ? members.find((m) => m.id === memberId) : profile
  const { weekStartWeekday } = useWeekStart(memberId || undefined, yearMonth, selectedMember?.hire_date)

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

  const load = async () => {
    setLoading(true)
    const firstDay = `${year}-${pad2(month)}-01`
    const lastDay = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`

    const { data: overrideRows } = await supabase
      .from('calendar_overrides')
      .select('override_date, name')
      .gte('override_date', firstDay)
      .lte('override_date', lastDay)

    const overrides: Record<string, string> = {}
    for (const o of overrideRows ?? []) overrides[o.override_date] = o.name
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
  for (const [date, name] of Object.entries(overridesMap)) {
    cells[date] = { status: 'unscheduled', overrideName: name }
  }

  const showWeekStart = !!selectedMember?.hire_date && !!selectedMember?.weekly_rest_check_enabled
  const isCompliant = checkWeeklyRestCompliance(year, month, weekStartWeekday, displayStatus)
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
                  {m.display_name}
                  {m.id === profile?.id ? '（我）' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-600 mb-1">月份</label>
          <input
            type="month"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
      </div>

      {loading ? (
        <div>載入中…</div>
      ) : (
        <>
          <PublicationStatusLine publications={publications} viewingId={viewingId} onChange={setViewingId} />
          {publications.length > 0 && (
            <>
              <Legend />
              <MonthCalendarGrid
                year={year}
                month={month}
                cells={cells}
                weekStartWeekday={showWeekStart ? weekStartWeekday : undefined}
              />

              {(showWeekStart || (isOwnSchedule && isViewingLatest && !confirmationLoading)) && (
                <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                  <div>
                    {showWeekStart && (
                      <p className={`text-sm ${isCompliant ? 'text-green-700' : 'text-red-600 font-medium'}`}>
                        {isCompliant ? '本月符合一例一休！' : '本月有完整周缺失一例一休，請檢查！'}
                      </p>
                    )}
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
