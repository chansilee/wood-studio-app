import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'

export function ClockInOut({ onRecorded }: { onRecorded?: () => void }) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const punch = (eventType: 'clock_in' | 'clock_out') => {
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
      </div>
      {message && (
        <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
