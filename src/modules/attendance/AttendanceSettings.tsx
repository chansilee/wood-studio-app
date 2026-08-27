import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { Tables } from '@/shared/types/database'

type OrgSettings = Tables<'org_settings'>

export function AttendanceSettings() {
  const [settings, setSettings] = useState<OrgSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('org_settings').select('*').eq('id', 1).single()
    setSettings(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((prev) =>
          prev ? { ...prev, company_lat: pos.coords.latitude, company_lng: pos.coords.longitude } : prev
        )
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    const { error } = await supabase
      .from('org_settings')
      .update({
        company_lat: settings.company_lat,
        company_lng: settings.company_lng,
        geofence_radius_m: settings.geofence_radius_m,
        geofence_disabled: settings.geofence_disabled,
        allow_delete_records: settings.allow_delete_records,
        disable_punch_on_non_workday: settings.disable_punch_on_non_workday,
        lunch_start: settings.lunch_start,
        lunch_end: settings.lunch_end,
        dinner_start: settings.dinner_start,
        dinner_end: settings.dinner_end,
      })
      .eq('id', 1)
    setSaving(false)
    setMessage(error ? `儲存失敗：${error.message}` : '設定已儲存')
  }

  if (loading || !settings) return <div>載入中…</div>

  return (
    <div className="space-y-6 max-w-md">
      <section>
        <h2 className="font-medium mb-2">公司地理圍欄</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">緯度 (latitude)</label>
            <input
              type="number"
              step="0.000001"
              value={settings.company_lat ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  company_lat: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">經度 (longitude)</label>
            <input
              type="number"
              step="0.000001"
              value={settings.company_lng ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  company_lng: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="border rounded px-2 py-1 w-full"
            />
          </div>
        </div>
        <button
          onClick={useCurrentLocation}
          disabled={locating}
          className="mt-2 text-xs underline text-blue-700 disabled:opacity-50"
        >
          {locating ? '定位中…' : '使用目前所在位置（站在工作室內點擊）'}
        </button>

        <div className="mt-3">
          <label className="block text-xs text-gray-600 mb-1">允許誤差半徑（公尺）</label>
          <input
            type="number"
            min={10}
            step={10}
            value={settings.geofence_radius_m}
            onChange={(e) => setSettings({ ...settings, geofence_radius_m: Number(e.target.value) })}
            className="border rounded px-2 py-1 w-32"
          />
        </div>

        <label className="flex items-center gap-2 mt-3 text-sm">
          <input
            type="checkbox"
            checked={settings.geofence_disabled}
            onChange={(e) => setSettings({ ...settings, geofence_disabled: e.target.checked })}
          />
          暫時關閉地理圍欄（debug / 公出用，打卡時不檢查位置）
        </label>

        <label className="flex items-center gap-2 mt-2 text-sm">
          <input
            type="checkbox"
            checked={settings.allow_delete_records}
            onChange={(e) => setSettings({ ...settings, allow_delete_records: e.target.checked })}
          />
          啟用刪除紀錄功能（打勾後，負責人可在「本日打卡紀錄」與「歷史打卡紀錄」刪除任一筆打卡，不限當天）
        </label>

        <label className="flex items-center gap-2 mt-2 text-sm">
          <input
            type="checkbox"
            checked={settings.disable_punch_on_non_workday}
            onChange={(e) => setSettings({ ...settings, disable_punch_on_non_workday: e.target.checked })}
          />
          當非上班日時，打卡按鈕直接不能點擊（打勾後，非「正常班」當天按鈕會變灰且無法點擊；關閉則按鈕維持原色，按下去後才判別）
        </label>
      </section>

      <section>
        <h2 className="font-medium mb-2">午休時段</h2>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={settings.lunch_start?.slice(0, 5) ?? ''}
            onChange={(e) => setSettings({ ...settings, lunch_start: e.target.value || null })}
            className="border rounded px-2 py-1"
          />
          <span>至</span>
          <input
            type="time"
            value={settings.lunch_end?.slice(0, 5) ?? ''}
            onChange={(e) => setSettings({ ...settings, lunch_end: e.target.value || null })}
            className="border rounded px-2 py-1"
          />
        </div>
      </section>

      <section>
        <h2 className="font-medium mb-2">晚餐時段</h2>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={settings.dinner_start?.slice(0, 5) ?? ''}
            onChange={(e) => setSettings({ ...settings, dinner_start: e.target.value || null })}
            className="border rounded px-2 py-1"
          />
          <span>至</span>
          <input
            type="time"
            value={settings.dinner_end?.slice(0, 5) ?? ''}
            onChange={(e) => setSettings({ ...settings, dinner_end: e.target.value || null })}
            className="border rounded px-2 py-1"
          />
        </div>
      </section>

      {message && <p className="text-sm text-green-700">{message}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {saving ? '儲存中…' : '儲存設定'}
      </button>
    </div>
  )
}
