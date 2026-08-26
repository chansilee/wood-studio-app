import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { ROLE_LABELS, type MemberRole } from '@/shared/constants/roles'
import type { Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>

const ROLE_OPTIONS: MemberRole[] = ['owner', 'staff', 'apprentice', 'guest']

export function MembersPage() {
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    setMembers(data ?? [])
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

  if (loading) return <div className="p-6">載入中…</div>

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">成員管理</h1>
      <p className="text-sm text-gray-600 mb-4">
        新註冊的帳號預設為「訪客」，請在此指派正確身分。只有負責人可以修改身分、約定每日工時、到職日與一例一休檢查設定。
      </p>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">姓名</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">身分</th>
              <th className="py-2 pr-4">約定每日工時</th>
              <th className="py-2 pr-4">到職日</th>
              <th className="py-2 pr-4">一例一休檢查</th>
              <th className="py-2 pr-4">必須公告班表</th>
              <th className="py-2 pr-4">必須計算月結</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="py-2 pr-4">{m.display_name || '(未設定)'}</td>
                <td className="py-2 pr-4">{m.email}</td>
                <td className="py-2 pr-4">
                  <select
                    value={m.role}
                    disabled={savingId === m.id}
                    onChange={(e) => updateRole(m.id, e.target.value as MemberRole)}
                    className="border rounded px-2 py-1"
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
