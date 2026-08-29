import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'

export interface JournalPrefs {
  hideUnavailableInputs: boolean
  actionFirst: boolean
  autoFillFirstOutput: boolean
}

const DEFAULT_PREFS: JournalPrefs = {
  hideUnavailableInputs: false,
  actionFirst: false,
  autoFillFirstOutput: false,
}

export function JournalPreferencesPanel() {
  const { profile } = useAuth()
  const [prefs, setPrefs] = useState<JournalPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('journal_preferences')
      .select('*')
      .eq('member_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            hideUnavailableInputs: data.hide_unavailable_inputs,
            actionFirst: data.action_first,
            autoFillFirstOutput: data.auto_fill_first_output,
          })
        }
        setLoading(false)
      })
  }, [profile])

  const update = async (patch: Partial<JournalPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    if (!profile) return
    await supabase.from('journal_preferences').upsert({
      member_id: profile.id,
      hide_unavailable_inputs: next.hideUnavailableInputs,
      action_first: next.actionFirst,
      auto_fill_first_output: next.autoFillFirstOutput,
    })
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  return (
    <div className="border rounded-lg p-4">
      <h2 className="font-medium mb-1 text-sm">日誌偏好設定</h2>
      <p className="text-xs text-gray-500 mb-3">這裡是你個人使用「生產紀錄」表單的顯示偏好，只影響你自己，跟其他人互不影響。</p>
      <label className="flex items-start gap-2 text-sm mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={prefs.hideUnavailableInputs}
          onChange={(e) => update({ hideUnavailableInputs: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          隱藏無法提交的輸入
          <span className="block text-xs text-gray-500">登錄時，狀態下拉式選單會隱藏目前可用數量為 0 的狀態，以精簡選擇。</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={prefs.actionFirst}
          onChange={(e) => update({ actionFirst: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          動作優先選擇
          <span className="block text-xs text-gray-500">
            打勾後，不用先選輸入狀態，可以直接從動作站清單選擇（例如「線鋸／雕刻／上色(赤)／上色(黑)」）；選了動作後，對應的輸入狀態會自動帶入。若同時勾選「隱藏無法提交的輸入」，沒有可用數量的動作也會一併隱藏。
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={prefs.autoFillFirstOutput}
          onChange={(e) => update({ autoFillFirstOutput: e.target.checked })}
          className="mt-0.5"
        />
        <span>
          預設全部數量正向提交
          <span className="block text-xs text-gray-500">
            打勾後，若該動作有多個輸出分支，會預設把全部數量填入第一個欄位（通常是良品），其餘欄位預設為 0，需要登記不良品時再手動調整。
          </span>
        </span>
      </label>
    </div>
  )
}
