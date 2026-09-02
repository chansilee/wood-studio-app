import { Fragment, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { ROLE_LABELS, type MemberRole } from '@/shared/constants/roles'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { formatDateTime } from '@/shared/lib/date'
import { MemberWageTable } from './MemberWageTable'
import type { Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>

const ROLE_OPTIONS: MemberRole[] = ['owner', 'staff', 'apprentice', 'guest']

export function MembersPage() {
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedWageId, setExpandedWageId] = useState<string | null>(null)
  // latest 員工線上打卡與工作時間確認條款 acknowledgment per member, for the
  // owner's records — keyed by member_id, value is the acknowledged_at ISO string
  const [termsAckMap, setTermsAckMap] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    const [{ data, error }, { data: ackRows }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase
        .from('attendance_terms_acknowledgments')
        .select('member_id, acknowledged_at')
        .order('acknowledged_at', { ascending: false }),
    ])
    if (error) setError(error.message)
    setMembers(data ?? [])
    const ackMap: Record<string, string> = {}
    for (const r of ackRows ?? []) {
      // rows are newest-first, so the first one seen per member is the latest
      ackMap[r.member_id] ??= r.acknowledged_at
    }
    setTermsAckMap(ackMap)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const updateRole = async (id: string, role: MemberRole) => {
    setSavingId(id)
    setError(null)
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    setSavingId(null)
    if (error) {
      setError(error.message)
      return
    }
    // role changes also reset weekly_rest_check_enabled server-side; reload to stay in sync
    load()
  }

  const updateDailyHours = async (id: string, hours: number) => {
    if (Number.isNaN(hours) || hours < 0) return
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ default_daily_hours: hours })
      .eq('id', id)
    if (error) setError(error.message)
    else
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, default_daily_hours: hours } : m))
      )
    setSavingId(null)
  }

  const updateScheduledStartTime = async (id: string, time: string) => {
    if (!time) return
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ scheduled_start_time: time })
      .eq('id', id)
    if (error) setError(error.message)
    else setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, scheduled_start_time: time } : m)))
    setSavingId(null)
  }

  const updateHireDate = async (id: string, hireDate: string) => {
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ hire_date: hireDate || null })
      .eq('id', id)
    if (error) setError(error.message)
    else
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, hire_date: hireDate || null } : m)))
    setSavingId(null)
  }

  const updateWeeklyRestCheck = async (id: string, enabled: boolean) => {
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ weekly_rest_check_enabled: enabled })
      .eq('id', id)
    if (error) setError(error.message)
    else
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, weekly_rest_check_enabled: enabled } : m))
      )
    setSavingId(null)
  }

  const updateMustPublish = async (id: string, enabled: boolean) => {
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ must_publish_schedule: enabled })
      .eq('id', id)
    if (error) setError(error.message)
    else
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, must_publish_schedule: enabled } : m)))
    setSavingId(null)
  }

  const updateMustCalculateSettlement = async (id: string, enabled: boolean) => {
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ must_calculate_settlement: enabled })
      .eq('id', id)
    if (error) setError(error.message)
    else
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, must_calculate_settlement: enabled } : m))
      )
    setSavingId(null)
  }

  const updatePreferredDisplayName = async (id: string, name: string) => {
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_display_name: name.trim() || null })
      .eq('id', id)
    if (error) setError(error.message)
    else
      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, preferred_display_name: name.trim() || null } : m))
      )
    setSavingId(null)
  }

  const updatePureManagement = async (id: string, enabled: boolean) => {
    setSavingId(id)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ pure_management: enabled })
      .eq('id', id)
    if (error) setError(error.message)
    else setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, pure_management: enabled } : m)))
    setSavingId(null)
  }

  const ownerCount = members.filter((m) => m.role === 'owner').length

  if (loading) return <div className="p-6">載入中…</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">成員管理</h1>
      <p className="text-sm text-gray-600 mb-4">
        新註冊的帳號預設為「訪客」，請在此指派正確身分。只有負責人可以修改身分、約定每日工時、約定上班時間、到職日與一例一休檢查設定。
      </p>
      <p className="text-sm text-gray-600 mb-4">
        「顯示名稱」是帳號自己設定的名字；填寫「本名（管理用）」後，全站（含該成員自己看到的畫面）都會改顯示這個名字，留空則維持顯示帳號自己設定的名字。
      </p>
      <p className="text-sm text-gray-600 mb-4">
        「純管理」僅負責人身分可勾選：勾選後，該負責人帳號會從排班/打卡/請假/月結的成員選單中隱藏（不會選到自己），但既有紀錄不受影響、不會被刪除，方便用來審核其他成員。
      </p>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">顯示名稱</th>
              <th className="py-2 pr-4">本名（管理用）</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">身分</th>
              <th className="py-2 pr-4">約定每日工時</th>
              <th className="py-2 pr-4">約定上班時間</th>
              <th className="py-2 pr-4">到職日</th>
              <th className="py-2 pr-4">一例一休檢查</th>
              <th className="py-2 pr-4">必須公告班表</th>
              <th className="py-2 pr-4">必須計算月結</th>
              <th className="py-2 pr-4">純管理</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <Fragment key={m.id}>
              <tr className="border-b">
                <td className="py-2 pr-4">{m.display_name || '(未設定)'}</td>
                <td className="py-2 pr-4">
                  <input
                    type="text"
                    defaultValue={m.preferred_display_name ?? ''}
                    placeholder="留空 = 使用顯示名稱"
                    disabled={savingId === m.id}
                    onBlur={(e) => updatePreferredDisplayName(m.id, e.target.value)}
                    className="border rounded px-2 py-1 w-32"
                  />
                </td>
                <td className="py-2 pr-4">{m.email}</td>
                <td className="py-2 pr-4">
                  <select
                    value={m.role}
                    disabled={savingId === m.id || (m.role === 'owner' && ownerCount <= 1)}
                    title={
                      m.role === 'owner' && ownerCount <= 1
                        ? '系統目前只有一位負責人，無法變更身分，以免失去管理權限'
                        : undefined
                    }
                    onChange={(e) => updateRole(m.id, e.target.value as MemberRole)}
                    className="border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    defaultValue={m.default_daily_hours}
                    disabled={savingId === m.id}
                    onBlur={(e) => updateDailyHours(m.id, Number(e.target.value))}
                    className="border rounded px-2 py-1 w-20"
                  />
                  <span className="ml-1 text-gray-500">小時</span>
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="time"
                    defaultValue={m.scheduled_start_time.slice(0, 5)}
                    disabled={savingId === m.id}
                    onBlur={(e) => updateScheduledStartTime(m.id, e.target.value)}
                    className="border rounded px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="date"
                    defaultValue={m.hire_date ?? ''}
                    disabled={savingId === m.id}
                    onBlur={(e) => updateHireDate(m.id, e.target.value)}
                    className="border rounded px-2 py-1"
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={m.weekly_rest_check_enabled}
                    disabled={savingId === m.id}
                    onChange={(e) => updateWeeklyRestCheck(m.id, e.target.checked)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={m.must_publish_schedule}
                    disabled={savingId === m.id}
                    onChange={(e) => updateMustPublish(m.id, e.target.checked)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={m.must_calculate_settlement}
                    disabled={savingId === m.id}
                    onChange={(e) => updateMustCalculateSettlement(m.id, e.target.checked)}
                  />
                </td>
                <td className="py-2 pr-4">
                  {m.role === 'owner' && (
                    <input
                      type="checkbox"
                      checked={m.pure_management}
                      disabled={savingId === m.id}
                      onChange={(e) => updatePureManagement(m.id, e.target.checked)}
                    />
                  )}
                </td>
                <td className="py-2 pr-4">
                  <button
                    onClick={() => setExpandedWageId((prev) => (prev === m.id ? null : m.id))}
                    className="border rounded w-7 h-7 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    $
                  </button>
                </td>
              </tr>
              {expandedWageId === m.id && (
                <tr className="border-b bg-gray-50">
                  <td colSpan={12} className="py-3 px-4">
                    <p className="text-xs text-gray-500 mb-2">{effectiveDisplayName(m)} - 約定月薪表</p>
                    <MemberWageTable memberId={m.id} hireDate={m.hire_date} />
                    <p className="text-xs text-gray-500 mt-4 mb-1">員工線上打卡與工作時間確認條款</p>
                    {termsAckMap[m.id] ? (
                      <p className="text-xs text-green-700">已於 {formatDateTime(termsAckMap[m.id])} 詳閱並同意</p>
                    ) : (
                      <p className="text-xs text-red-600">尚未詳閱並同意</p>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
