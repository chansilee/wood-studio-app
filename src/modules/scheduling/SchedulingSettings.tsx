import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import type { Tables } from '@/shared/types/database'

type OrgSettings = Tables<'org_settings'>

export function SchedulingSettings() {
  const { settings, loading, reload } = useOrgSettings()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async (patch: Partial<Pick<OrgSettings, 'block_past_scheduling' | 'remind_month_end_publish'>>) => {
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
      <h2 className="font-medium">排班設定</h2>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.block_past_scheduling}
          disabled={saving}
          onChange={(e) => save({ block_past_scheduling: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          阻擋過去時間排班
          <br />
          <span className="text-xs text-gray-500">
            開啟後，今天以前的排班只能顯示，滑鼠移過去也無法再修改，避免打卡出勤結算後排班狀態被誤改。
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.remind_month_end_publish}
          disabled={saving}
          onChange={(e) => save({ remind_month_end_publish: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          月底提醒公告下月排班狀態
          <br />
          <span className="text-xs text-gray-500">
            開啟後，每月 25 號起，若「必須公告班表」的成員還沒收到下個月的班表公告，首頁會顯示紅字提醒。
          </span>
        </span>
      </label>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
