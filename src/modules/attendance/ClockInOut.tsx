import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { prevDateStr, todayStr } from '@/shared/lib/date'
import { isMonthSettled, MONTH_SETTLED_MESSAGE, yearMonthOf } from '@/shared/lib/settlementLock'
import { ATTENDANCE_BUFFER_HOURS } from '@/shared/lib/attendanceStatus'
import type { Enums } from '@/shared/types/database'

type EventType = Enums<'attendance_event_type'>

const EARLY_CLOCK_IN_ALLOWANCE_MINUTES = 15

/** minutes remaining until `scheduledStartTime` ('HH:MM:SS'), today, in the viewer's local clock */
function minutesUntilScheduledStart(scheduledStartTime: string): number {
  const [h, m] = scheduledStartTime.split(':').map(Number)
  const now = new Date()
  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0)
  return (scheduled.getTime() - now.getTime()) / 60000
}

export function ClockInOut({ onRecorded }: { onRecorded?: () => void }) {
  const { profile } = useAuth()
  const { settings: orgSettings } = useOrgSettings()
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [isWorkday, setIsWorkday] = useState<boolean | null>(null)

  const [showBackfill, setShowBackfill] = useState(false)
  const [backfillType, setBackfillType] = useState<EventType>('clock_in')
  const [backfillDateTime, setBackfillDateTime] = useState('')
  const [submittingBackfill, setSubmittingBackfill] = useState(false)
  const [backfillMessage, setBackfillMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )
  const [backfillMonthSettled, setBackfillMonthSettled] = useState(false)

  const maxBackfillDateTime = `${prevDateStr(todayStr())}T23:59`

  // proactively re-check every time the picked date changes, since a
  // backfill can target any past date regardless of which month is
  // currently selected elsewhere on the page
  useEffect(() => {
    if (!profile || !backfillDateTime) {
      setBackfillMonthSettled(false)
      return
    }
    isMonthSettled(profile.id, yearMonthOf(backfillDateTime)).then(setBackfillMonthSettled)
  }, [profile, backfillDateTime])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('schedules')
      .select('status')
      .eq('member_id', profile.id)
      .eq('work_date', todayStr())
      .maybeSingle()
      .then(({ data }) => setIsWorkday(data?.status === 'normal'))
  }, [profile])

  const punch = (eventType: EventType) => {
    if (!profile) return
    setMessage(null)
    setWarning(null)

    if (eventType === 'clock_in' && profile.scheduled_start_time) {
      const early = minutesUntilScheduledStart(profile.scheduled_start_time)
      if (early > EARLY_CLOCK_IN_ALLOWANCE_MINUTES) {
        setMessage({ type: 'error', text: '只允許約定上班時間前15分鐘內開放打卡！' })
        return
      }
    }

    setBusy(eventType === 'clock_in' ? 'in' : 'out')

    if (!('geolocation' in navigator)) {
      setMessage({ type: 'error', text: '此瀏覽器不支援定位功能，無法打卡' })
      setBusy(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { error } = await supabase.from('attendance_events').insert({
          member_id: profile.id,
          event_type: eventType,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setBusy(null)
        if (error) {
          setMessage({ type: 'error', text: `打卡失敗：${error.message}` })
        } else {
          setMessage({
            type: 'success',
            text: eventType === 'clock_in' ? '上班打卡成功' : '下班打卡成功',
          })
          onRecorded?.()
          if (eventType === 'clock_out') await checkClockOutBuffer()
        }
      },
      (geoError) => {
        setBusy(null)
        setMessage({ type: 'error', text: `無法取得定位：${geoError.message}` })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // non-blocking heads-up: the punch itself already succeeded above, this
  // just prompts the employee to go resolve the excess in 請假系統 if today's
  // worked hours land beyond the (OT-extended) paid buffer ceiling
  const checkClockOutBuffer = async () => {
    if (!profile) return
    const today = todayStr()
    const [{ data: summary }, { data: otRow }] = await Promise.all([
      supabase
        .from('attendance_summary')
        .select('worked_hours')
        .eq('member_id', profile.id)
        .eq('work_date', today)
        .maybeSingle(),
      supabase
        .from('overtime_pre_reports')
        .select('requested_hours')
        .eq('member_id', profile.id)
        .eq('work_date', today)
        .eq('status', 'approved')
        .maybeSingle(),
    ])
    const worked = Number(summary?.worked_hours ?? 0)
    const ddh = Number(profile.default_daily_hours ?? 6)
    const approvedOT = otRow ? Number(otRow.requested_hours) : null
    const ceiling = ddh + (approvedOT ?? ATTENDANCE_BUFFER_HOURS)
    if (worked > ceiling) {
      setWarning('下班打卡時間超過緩衝15分鐘，請於請假系統回覆超時工作事實！')
    }
  }

  const submitBackfill = async () => {
    if (!profile || !backfillDateTime) return
    setSubmittingBackfill(true)
    setBackfillMessage(null)

    const occurredAt = `${backfillDateTime}:00+08:00`
    const { error } = await supabase.from('attendance_events').insert({
      member_id: profile.id,
      event_type: backfillType,
      lat: 0,
      lng: 0,
      is_backfill: true,
      occurred_at: occurredAt,
    })
    setSubmittingBackfill(false)
    if (error) {
      setBackfillMessage({ type: 'error', text: `補登失敗：${error.message}` })
      return
    }
    setBackfillMessage({
      type: 'success',
      text: profile.role === 'owner' ? '補登已自動核准' : '補登申請已送出，待負責人審核',
    })
    setBackfillDateTime('')
    onRecorded?.()
  }

  // while workday status / settings are still loading, stay neutral rather than
  // briefly flashing the colored buttons before possibly downgrading to gray
  const dataReady = isWorkday !== null && !!orgSettings
  const punchDisabledByPolicy =
    !dataReady || (isWorkday === false && !!orgSettings?.disable_punch_on_non_workday)

  return (
    <div className="mb-6">
      {isWorkday !== null && (
        <p className={`mb-2 font-bold ${isWorkday ? 'text-green-700' : 'text-red-600'}`}>
          {isWorkday ? '今天是您的上班日！' : '今天「不是」您的上班日！'}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={() => punch('clock_in')}
          disabled={busy !== null || punchDisabledByPolicy}
          className={`flex-1 rounded-lg py-6 text-lg font-medium disabled:opacity-50 ${
            punchDisabledByPolicy
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 text-white'
          }`}
        >
          {busy === 'in' ? '打卡中…' : '點我打卡上班'}
        </button>
        <button
          onClick={() => punch('clock_out')}
          disabled={busy !== null || punchDisabledByPolicy}
          className={`flex-1 rounded-lg py-6 text-lg font-medium disabled:opacity-50 ${
            punchDisabledByPolicy
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-orange-600 text-white'
          }`}
        >
          {busy === 'out' ? '打卡中…' : '點我打卡下班'}
        </button>
        <button
          onClick={() => setShowBackfill((v) => !v)}
          className="px-4 bg-gray-700 text-white rounded-lg text-sm font-medium"
        >
          點我補登
        </button>
      </div>
      {message && (
        <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
      {warning && <p className="mt-1 text-sm text-amber-600 font-medium">{warning}</p>}

      {showBackfill && (
        <div className="mt-4 border rounded p-4 bg-gray-50">
          <h3 className="font-medium text-sm mb-3">補登打卡（僅能補登昨天以前的紀錄）</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">類型</label>
              <select
                value={backfillType}
                onChange={(e) => setBackfillType(e.target.value as EventType)}
                className="border rounded px-2 py-1"
              >
                <option value="clock_in">上班</option>
                <option value="clock_out">下班</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">日期時間（精確到分）</label>
              <input
                type="datetime-local"
                value={backfillDateTime}
                max={maxBackfillDateTime}
                onChange={(e) => setBackfillDateTime(e.target.value)}
                className="border rounded px-2 py-1"
              />
            </div>
            <button
              onClick={submitBackfill}
              disabled={submittingBackfill || !backfillDateTime || backfillMonthSettled}
              className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {submittingBackfill ? '送出中…' : '送出補登申請'}
            </button>
          </div>
          {backfillMonthSettled && (
            <p className="mt-2 text-sm text-red-600 font-medium">{MONTH_SETTLED_MESSAGE}</p>
          )}
          {backfillMessage && (
            <p
              className={`mt-2 text-sm ${
                backfillMessage.type === 'success' ? 'text-green-700' : 'text-red-600'
              }`}
            >
              {backfillMessage.text}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
