import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import type { Tables } from '@/shared/types/database'

type OrgSettings = Tables<'org_settings'>

export function SchedulingSettings() {
  const { settings, loading, reload } = useOrgSettings()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async (
    patch: Partial<
      Pick<
        OrgSettings,
        | 'block_past_scheduling'
        | 'remind_month_end_publish'
        | 'protect_review_records'
        | 'show_color_legend'
        | 'enable_week_start_adjust'
      >
    >
  ) => {
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

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.protect_review_records}
          disabled={saving}
          onChange={(e) => save({ protect_review_records: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          避免刪除審閱紀錄
          <br />
          <span className="text-xs text-gray-500">
            開啟後（預設），審閱紀錄無法刪除。關閉後，可在「審閱紀錄」頁面個別刪除紀錄，刪除後該成員會視為尚未審閱。
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.show_color_legend}
          disabled={saving}
          onChange={(e) => save({ show_color_legend: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          顯示排班顏色範例框框
          <br />
          <span className="text-xs text-gray-500">
            開啟後，月曆上方會顯示「正常班」「例假」等顏色說明框框；預設關閉。
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.enable_week_start_adjust}
          disabled={saving}
          onChange={(e) => save({ enable_week_start_adjust: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          開啟周起始調整鈕
          <br />
          <span className="text-xs text-gray-500">
            開啟後（預設），排班模式月曆下方會顯示「切換周起始」的調整列；關閉後則隱藏該列。
          </span>
        </span>
      </label>

      {message && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
