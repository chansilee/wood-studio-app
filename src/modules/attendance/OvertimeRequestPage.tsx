import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { formatDateTime, todayStr } from '@/shared/lib/date'
import { isSelectableMember } from '@/shared/lib/members'
import type { Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>
type OvertimeReport = Tables<'overtime_pre_reports'>
type OvertimeGate = Tables<'overtime_report_gates'>

const HOUR_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]

export function OvertimeRequestPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const today = todayStr()

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">額外出勤</h1>
      <p className="text-sm text-gray-600 mb-4">
        只能申請「今天」的額外出勤，並填寫預期額外出勤時數上限（最高 4 小時）。負責人需在今天結束前核准，逾期未處理視為不核准。
      </p>
      {isOwner ? <OwnerOverview today={today} ownerId={profile!.id} /> : <SelfReportGate today={today} memberId={profile!.id} />}
    </div>
  )
}

function SelfReportGate({ today, memberId }: { today: string; memberId: string }) {
  const [gate, setGate] = useState<OvertimeGate | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('overtime_report_gates')
      .select('*')
      .eq('member_id', memberId)
      .eq('work_date', today)
      .maybeSingle()
      .then(({ data }) => {
        setGate(data)
        setLoading(false)
      })
  }, [memberId, today])

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  if (!gate?.is_open) {
    return (
      <div className="border border-red-200 bg-red-50 rounded p-4">
        <p className="text-sm text-red-600 font-medium">
          額外出勤，目前須找「負責人」填寫紙本並填寫理由，方能進行。
        </p>
      </div>
    )
  }

  return <SelfReportForm today={today} memberId={memberId} />
}

function SelfReportForm({ today, memberId }: { today: string; memberId: string }) {
  const [existing, setExisting] = useState<OvertimeReport | null>(null)
  const [hours, setHours] = useState('1')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('overtime_pre_reports')
      .select('*')
      .eq('member_id', memberId)
      .eq('work_date', today)
      .maybeSingle()
    setExisting(data)
    if (data) setHours(String(data.requested_hours))
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    const { error } = existing
      ? await supabase
          .from('overtime_pre_reports')
          .update({ requested_hours: Number(hours) })
          .eq('id', existing.id)
      : await supabase
          .from('overtime_pre_reports')
          .insert({ member_id: memberId, work_date: today, requested_hours: Number(hours) })
    setSubmitting(false)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  const editable = !existing || existing.status === 'pending'

  return (
    <div className="border rounded p-4">
      <p className="text-sm text-gray-600 mb-3">{today} 的額外出勤申請</p>
      {existing && (
        <p
          className={`text-sm mb-3 ${
            existing.status === 'approved'
              ? 'text-green-700'
              : existing.status === 'rejected'
                ? 'text-red-600'
                : 'text-yellow-800'
          }`}
        >
          {existing.status === 'approved'
            ? `已核准，上限 ${existing.requested_hours} 小時`
            : existing.status === 'rejected'
              ? '負責人不同意本次額外出勤申請'
              : '審核中，尚未核准'}
        </p>
      )}
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {editable ? (
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">預期額外出勤時數上限</label>
            <select
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="border rounded px-2 py-1.5 text-sm"
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h} 小時
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={submit}
            disabled={submitting}
            className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {submitting ? '送出中…' : existing ? '更新預報' : '送出預報'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500">此筆已審核，無法再修改。</p>
      )}
    </div>
  )
}

function StatusText({
  report,
  member,
  reviewerNames,
}: {
  report: OvertimeReport
  member: Profile
  reviewerNames: Record<string, string>
}) {
  const memberName = effectiveDisplayName(member)
  const reviewerName = report.reviewed_by ? reviewerNames[report.reviewed_by] ?? '未知' : null
  const at = report.reviewed_at ? formatDateTime(report.reviewed_at) : '未知時間'

  if (report.source === 'owner_manual') {
    return <span className="text-green-700">於 {at}：負責人{reviewerName ?? '未知'}依紙本約定代為輸入</span>
  }
  // source === 'self'
  if (report.status === 'approved') {
    return (
      <span className="text-green-700">
        於 {at}：負責人{reviewerName ?? '未知'}同意員工{memberName}線上申報時數
      </span>
    )
  }
  if (report.status === 'rejected') {
    return (
      <span className="text-red-600">
        於 {at}：負責人{reviewerName ?? '未知'}不同意員工{memberName}線上申報時數
      </span>
    )
  }
  return <span className="text-yellow-800">員工{memberName}已送出線上申報，待負責人審核</span>
}

function OwnerOverview({ today, ownerId }: { today: string; ownerId: string }) {
  const [rows, setRows] = useState<{ member: Profile; report: OvertimeReport | null; gate: OvertimeGate | null }[]>(
    []
  )
  const [reviewerNames, setReviewerNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editHours, setEditHours] = useState('1')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    await supabase.rpc('expire_stale_overtime_reports')
    const { data: members } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['owner', 'staff'])
      .order('display_name')
    const selectable = (members ?? []).filter(isSelectableMember)
    const memberIds = selectable.map((m) => m.id)
    const [{ data: reports }, { data: gates }] =
      memberIds.length > 0
        ? await Promise.all([
            supabase.from('overtime_pre_reports').select('*').in('member_id', memberIds).eq('work_date', today),
            supabase.from('overtime_report_gates').select('*').in('member_id', memberIds).eq('work_date', today),
          ])
        : [{ data: [] as OvertimeReport[] }, { data: [] as OvertimeGate[] }]
    const reportMap = Object.fromEntries((reports ?? []).map((r) => [r.member_id, r]))
    const gateMap = Object.fromEntries((gates ?? []).map((g) => [g.member_id, g]))
    setRows(selectable.map((m) => ({ member: m, report: reportMap[m.id] ?? null, gate: gateMap[m.id] ?? null })))

    const reviewerIds = Array.from(
      new Set((reports ?? []).map((r) => r.reviewed_by).filter((id): id is string => !!id))
    )
    if (reviewerIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, preferred_display_name')
        .in('id', reviewerIds)
      setReviewerNames(Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)])))
    } else {
      setReviewerNames({})
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const toggleOpen = async (memberId: string, isOpen: boolean) => {
    setSavingId(memberId)
    setError(null)
    const { error } = await supabase
      .from('overtime_report_gates')
      .upsert(
        { member_id: memberId, work_date: today, is_open: isOpen, opened_by: ownerId, opened_at: new Date().toISOString() },
        { onConflict: 'member_id,work_date' }
      )
    if (error) {
      setSavingId(null)
      setError(`提交錯誤：${error.message}`)
      return
    }
    // closing the gate resets the day entirely — whatever hours exist (self-
    // submitted or owner-filled, approved/pending/rejected) get cleared too,
    // so a closed day never shows a stale leftover number
    if (!isOpen) {
      const { error: clearError } = await supabase
        .from('overtime_pre_reports')
        .delete()
        .eq('member_id', memberId)
        .eq('work_date', today)
      if (clearError) {
        setSavingId(null)
        setError(`提交錯誤：${clearError.message}`)
        return
      }
    }
    setSavingId(null)
    load()
  }

  const startEdit = (memberId: string, current: OvertimeReport | null) => {
    setEditingId(memberId)
    setEditHours(current ? String(current.requested_hours) : '1')
  }

  const saveHours = async (memberId: string, existing: OvertimeReport | null) => {
    setSavingId(memberId)
    setError(null)
    const { error } = existing
      ? await supabase
          .from('overtime_pre_reports')
          .update({ requested_hours: Number(editHours) })
          .eq('id', existing.id)
      : await supabase
          .from('overtime_pre_reports')
          .insert({ member_id: memberId, work_date: today, requested_hours: Number(editHours) })
    setSavingId(null)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    setEditingId(null)
    load()
  }

  const deleteReport = async (memberId: string, reportId: string) => {
    setSavingId(memberId)
    setError(null)
    const { error } = await supabase.from('overtime_pre_reports').delete().eq('id', reportId)
    setSavingId(null)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    load()
  }

  if (loading) return <div className="text-sm text-gray-500">載入中…</div>

  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">{today} 全體成員額外出勤狀態</p>
      <p className="text-xs text-gray-500 mb-3">
        目前線上自報功能預設關閉：員工額外出勤須先以紙本向負責人說明理由，再由負責人在下表「手動編輯」代為輸入。「開放員工今日預報」是保留給日後開放員工自行上線申請用的開關，勾選後當事人才能在自己的額外出勤頁面看到申請表單。
      </p>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">成員</th>
              <th className="py-2 pr-4">開放員工今日預報</th>
              <th className="py-2 pr-4">額外出勤時數</th>
              <th className="py-2 pr-4">狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, report, gate }) => {
              const busy = savingId === member.id
              const isEditing = editingId === member.id
              return (
                <tr key={member.id} className="border-b">
                  <td className="py-2 pr-4">{effectiveDisplayName(member)}</td>
                  <td className="py-2 pr-4">
                    <input
                      type="checkbox"
                      checked={!!gate?.is_open}
                      disabled={busy}
                      onChange={(e) => toggleOpen(member.id, e.target.checked)}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editHours}
                          onChange={(e) => setEditHours(e.target.value)}
                          className="border rounded px-2 py-1 text-xs"
                        >
                          {HOUR_OPTIONS.map((h) => (
                            <option key={h} value={h}>
                              {h} 小時
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => saveHours(member.id, report)}
                          disabled={busy}
                          className="text-xs bg-black text-white rounded px-2 py-1 disabled:opacity-50"
                        >
                          儲存
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                          className="text-xs text-gray-500 underline"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{report ? `${report.requested_hours} 小時` : '?小時'}</span>
                        <button
                          onClick={() => startEdit(member.id, report)}
                          disabled={busy}
                          className="text-xs text-blue-700 underline disabled:opacity-50"
                        >
                          手動編輯
                        </button>
                        {report && (
                          <button
                            onClick={() => deleteReport(member.id, report.id)}
                            disabled={busy}
                            className="text-xs text-red-600 underline disabled:opacity-50"
                          >
                            刪除
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {report ? (
                      <StatusText report={report} member={member} reviewerNames={reviewerNames} />
                    ) : gate?.is_open ? (
                      <span className="text-blue-700">已開放線上預報</span>
                    ) : (
                      <span className="text-gray-400">未開放線上預報</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
