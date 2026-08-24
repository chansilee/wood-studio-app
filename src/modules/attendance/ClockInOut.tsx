import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { prevDateStr, todayStr } from '@/shared/lib/date'
import type { Enums } from '@/shared/types/database'

type EventType = Enums<'attendance_event_type'>

export function ClockInOut({ onRecorded }: { onRecorded?: () => void }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [showBackfill, setShowBackfill] = useState(false)
  const [backfillType, setBackfillType] = useState<EventType>('clock_in')
  const [backfillDateTime, setBackfillDateTime] = useState('')
  const [submittingBackfill, setSubmittingBackfill] = useState(false)
  const [backfillMessage, setBackfillMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  )

  const maxBackfillDateTime = `${prevDateStr(todayStr())}T23:59`

  const punch = (eventType: EventType) => {
    if (!profile) return
    setBusy(eventType === 'clock_in' ? 'in' : 'out')
    setMessage(null)

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
        }
      },
      (geoError) => {
        setBusy(null)
        setMessage({ type: 'error', text: `無法取得定位：${geoError.message}` })
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
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

  return (
    <div className="mb-6">
      <div className="flex gap-3">
        <button
          onClick={() => punch('clock_in')}
          disabled={busy !== null}
          className="flex-1 bg-green-600 text-white rounded-lg py-6 text-lg font-medium disabled:opacity-50"
        >
          {busy === 'in' ? '打卡中…' : '點我打卡上班'}
        </button>
        <button
          onClick={() => punch('clock_out')}
          disabled={busy !== null}
          className="flex-1 bg-orange-600 text-white rounded-lg py-6 text-lg font-medium disabled:opacity-50"
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
              disabled={submittingBackfill || !backfillDateTime}
              className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {submittingBackfill ? '送出中…' : '送出補登申請'}
            </button>
          </div>
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
