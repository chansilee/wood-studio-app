import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'

export function SettlementSettings() {
  const { settings, loading, reload } = useOrgSettings()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async (patch: { default_last_month_before_5: boolean }) => {
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.from('org_settings').update(patch).eq('id', 1)
    setSaving(false)
    if (error) {
      setMessage(`儲存失敗：${error.message}`)
      return
    }
    reload()
  }

  if (loading || !settings) return <div>載入中…</div>

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="font-medium">月結設定</h2>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.default_last_month_before_5}
          disabled={saving}
          onChange={(e) => save({ default_last_month_before_5: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          當月 5 號以前預設顯示上個月月結
          <br />
          <span className="text-xs text-gray-500">
            開啟後（預設），每月 1～5 號進入[月結系統]會預設顯示上個月的月結。關閉後，一律以當月來顯示。
          </span>
        </span>
      </label>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
