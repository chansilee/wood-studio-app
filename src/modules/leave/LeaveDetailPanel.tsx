import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { formatDateTime } from '@/shared/lib/date'
import { formatHours } from './leaveDisplay'
import { computeAttendanceStatus } from '@/shared/lib/attendanceStatus'
import { MONTH_SETTLED_MESSAGE } from '@/shared/lib/settlementLock'
import type { Enums, Tables, TablesInsert } from '@/shared/types/database'

type LeaveType = Tables<'leave_types'>
type LeaveRequestRow = Tables<'leave_requests'> & {
  leave_type_name?: string
  leave_type_pay_coefficient?: number
  reviewer_name?: string
}
type DurationType = Enums<'leave_duration_type'>
type OvertimeResolution = 'unresolved' | 'paid_as_overtime' | 'self_practice'

function formatClockTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

export function LeaveDetailPanel({
  date,
  memberId,
  isOwner,
  isPast,
  canDeclare,
  canUseManagerOverride,
  monthSettled,
  leaveRequest,
  rawHours,
  clockInAt,
  clockOutAt,
  defaultDailyHours,
  leaveTypes,
  onChanged,
  onClose,
}: {
  date: string
  memberId: string
  isOwner: boolean
  /** whether this date has already settled (i.e. is strictly before today) */
  isPast: boolean
  canDeclare: boolean
  /** owner-only: this day is abnormal attendance, has both a clock-in and a
   * clock-out on record, and has no existing leave/override record yet —
   * 勞基法要求上下班都要有打卡紀錄才能核准，缺一邊就不給按 */
  canUseManagerOverride: boolean
  /** this date's month already has a settlement snapshot — nothing here may be created, reviewed, or deleted */
  monthSettled: boolean
  leaveRequest?: LeaveRequestRow
  rawHours: number | null
  clockInAt: string | null
  clockOutAt: string | null
  defaultDailyHours: number
  leaveTypes: LeaveType[]
  onChanged: () => void
  onClose: () => void
}) {
  const { profile } = useAuth()
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? '')
  const [durationType, setDurationType] = useState<DurationType>('full_day')
  const [hours, setHours] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 額外出勤 / 延工事實 for this single day — self-fetched here (rather than
  // threaded through LeaveCalendar's already-delicate flash-fix state) since
  // it's only needed while this one day's panel is open
  const [otReport, setOtReport] = useState<{ requestedHours: number; status: string } | null>(null)
  const [otResolution, setOtResolution] = useState<OvertimeResolution>('unresolved')
  const [otLoaded, setOtLoaded] = useState(false)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setOtLoaded(false)
    Promise.all([
      supabase
        .from('overtime_pre_reports')
        .select('requested_hours, status')
        .eq('member_id', memberId)
        .eq('work_date', date)
        .maybeSingle(),
      supabase
        .from('attendance_overtime_facts')
        .select('resolution')
        .eq('member_id', memberId)
        .eq('work_date', date)
        .maybeSingle(),
    ]).then(([{ data: ot }, { data: fact }]) => {
      if (cancelled) return
      setOtReport(ot ? { requestedHours: Number(ot.requested_hours), status: ot.status } : null)
      setOtResolution((fact?.resolution as OvertimeResolution | undefined) ?? 'unresolved')
      setOtLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [date, memberId])

  const approvedOtCap = otReport?.status === 'approved' ? otReport.requestedHours : 0
  // no-leave attendance status, purely to drive the overtime-choice gate below —
  // the mini status table further down computes its own (leave-aware) result
  const plainStatus = computeAttendanceStatus({
    rawHours: rawHours ?? 0,
    contractHours: defaultDailyHours,
    isAbsence: false,
    isManagerOverride: false,
    isFullDayLeave: false,
    isPartialLeave: false,
    leaveTypeName: null,
    leaveHours: null,
    leaveCoefficient: null,
    leaveContributedHours: 0,
    approvedOvertimeHours: approvedOtCap,
  })
  const unresolvedOtExcess = plainStatus.unresolvedExcessHours
  const needsOvertimeChoice =
    isPast && !leaveRequest && !monthSettled && otLoaded && otResolution === 'unresolved' && unresolvedOtExcess > 1e-9

  const resolveOvertime = async (resolution: 'paid_as_overtime' | 'self_practice') => {
    if (!profile) return
    setResolving(true)
    setError(null)
    const note = resolution === 'self_practice' ? '下班自主練習，無延工事實' : ''
    const { error } = await supabase
      .from('attendance_overtime_facts')
      .upsert(
        { member_id: memberId, work_date: date, note, resolution, recorded_by: profile.id },
        { onConflict: 'member_id,work_date' }
      )
    setResolving(false)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    setOtResolution(resolution)
    onChanged()
  }

  const submit = async () => {
    if (!profile || !leaveTypeId) return
    if (durationType === 'partial' && (!hours || Number(hours) <= 0)) {
      setError('提交錯誤：請填寫請假時數')
      return
    }
    if (durationType === 'partial' && Math.abs(Math.round(Number(hours) * 2) - Number(hours) * 2) > 1e-9) {
      setError('提交錯誤：請假以半小時為單位')
      return
    }
    setSubmitting(true)
    setError(null)

    const payload: TablesInsert<'leave_requests'> = {
      member_id: memberId,
      leave_date: date,
      leave_type_id: leaveTypeId,
      duration_type: durationType,
      hours: durationType === 'partial' ? Number(hours) : null,
    }
    // approval status is enforced server-side (trg_validate_leave_request), not by this payload

    const { error } = await supabase.from('leave_requests').insert(payload)
    setSubmitting(false)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    onChanged()
  }

  const submitOverride = async () => {
    setOverriding(true)
    setError(null)

    const payload: TablesInsert<'leave_requests'> = {
      member_id: memberId,
      leave_date: date,
      is_manager_override: true,
      leave_type_id: null,
    }
    const { error } = await supabase.from('leave_requests').insert(payload)
    setOverriding(false)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    onChanged()
  }

  const review = async (status: 'approved' | 'rejected') => {
    if (!profile || !leaveRequest) return
    setActing(true)
    setError(null)
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', leaveRequest.id)
    setActing(false)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    onChanged()
  }

  const remove = async () => {
    if (!leaveRequest) return
    setActing(true)
    setError(null)
    const { error } = await supabase.from('leave_requests').delete().eq('id', leaveRequest.id)
    setActing(false)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    onChanged()
  }

  const canDelete =
    !monthSettled &&
    (leaveRequest
      ? leaveRequest.is_manager_override || leaveRequest.is_absence
        ? isOwner
        : isOwner || memberId === profile?.id
      : false)

  return (
    <div className="border rounded p-4 bg-gray-50 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">{date}</h3>
        <button onClick={onClose} className="text-xs text-gray-500 underline">
          關閉
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {monthSettled && <p className="text-red-600 text-sm mb-2 font-medium">{MONTH_SETTLED_MESSAGE}</p>}

      {isPast ? (
        (() => {
          // show what was actually declared regardless of pending/approved/
          // rejected — a rejected request stays visible (with a "（不同意）"
          // marker below) until the employee presses 重來 to clear it, at
          // which point leaveRequest is gone and this reverts to the plain
          // raw-attendance text on its own
          const isAbsence = !!leaveRequest?.is_absence
          const isManagerOverride = !!leaveRequest?.is_manager_override
          const isRegularLeave = !!leaveRequest && !isAbsence && !isManagerOverride
          const isFullDayLeave = isRegularLeave && leaveRequest!.duration_type === 'full_day'
          const isPartialLeave = isRegularLeave && leaveRequest!.duration_type !== 'full_day'
          const leaveContributedHours = !isRegularLeave
            ? 0
            : isFullDayLeave
              ? defaultDailyHours
              : Number(leaveRequest!.hours ?? 0)
          const { color, statusNote, contractLabel } = computeAttendanceStatus({
            rawHours: rawHours ?? 0,
            contractHours: defaultDailyHours,
            isAbsence,
            isManagerOverride,
            isFullDayLeave,
            isPartialLeave,
            leaveTypeName: leaveRequest?.leave_type_name ?? null,
            leaveHours: leaveRequest?.hours ?? null,
            leaveCoefficient: leaveRequest?.leave_type_pay_coefficient ?? null,
            leaveContributedHours,
            approvedOvertimeHours: approvedOtCap,
          })
          // still awaiting the owner's decision, or already turned down —
          // flag either on the declared-leave text so it's never mistaken
          // for a final, settled status
          const displayNote =
            leaveRequest?.status === 'pending'
              ? `${statusNote}（審核中）`
              : leaveRequest?.status === 'rejected'
                ? `${statusNote}（不同意）`
                : statusNote
          return (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left border-b text-gray-500">
                    <th className="py-1 pr-3">日期</th>
                    <th className="py-1 pr-3">上班打卡</th>
                    <th className="py-1 pr-3">下班打卡</th>
                    <th className="py-1 pr-3">實際停留時數</th>
                    <th className="py-1 pr-3">契約工時</th>
                    <th className="py-1 pr-3">請假 / 出勤狀況註記</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1 pr-3 whitespace-nowrap">{date}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatClockTime(clockInAt)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatClockTime(clockOutAt)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{formatHours(rawHours)}小時</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{contractLabel}</td>
                    <td
                      className={`py-1 pr-3 font-medium ${
                        color === 'green' ? 'text-green-700' : color === 'blue' ? 'text-blue-700' : 'text-red-600'
                      }`}
                    >
                      {displayNote}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })()
      ) : (
        <p className="text-sm text-gray-500 mb-3">＜尚未出勤＞</p>
      )}

      {isPast && !leaveRequest && unresolvedOtExcess > 1e-9 && otResolution !== 'unresolved' && (
        <p className="text-xs text-green-700 mb-3">
          延工 / 自主時間確認：
          {otResolution === 'paid_as_overtime'
            ? `已核算延工費${formatHours(unresolvedOtExcess)}小時`
            : '員工簽認：下班自主練習，無延工事實'}
        </p>
      )}

      {leaveRequest ? (
        <div className="space-y-2 text-sm">
          {isPast && leaveRequest.status === 'approved' && !leaveRequest.is_manager_override && leaveRequest.duration_type === 'partial' && (
            <p className="text-xs text-gray-500">
              原出勤時數 {formatHours(rawHours)} + 請假 {leaveRequest.hours} 小時 ={' '}
              {(Number(rawHours ?? 0) + Number(leaveRequest.hours ?? 0)).toFixed(2)} 小時，約定工時{' '}
              {defaultDailyHours} 小時 →{' '}
              {Number(rawHours ?? 0) + Number(leaveRequest.hours ?? 0) >= defaultDailyHours
                ? '已達標，視為正常出勤'
                : '仍未達標，維持異常出勤'}
            </p>
          )}
          {leaveRequest.status !== 'pending' && leaveRequest.reviewed_by && leaveRequest.reviewed_at && (
            <p className="text-xs text-gray-500">
              由 {leaveRequest.reviewer_name ?? '未知'} 於 {formatDateTime(leaveRequest.reviewed_at)}{' '}
              {leaveRequest.status === 'approved' ? '同意' : '不同意'}此申報
            </p>
          )}

          <div className="flex gap-2 pt-2">
            {isOwner && leaveRequest.status === 'pending' && !monthSettled && (
              <>
                <button
                  onClick={() => review('approved')}
                  disabled={acting}
                  className="bg-green-600 text-white rounded px-3 py-1 text-xs disabled:opacity-50"
                >
                  同意
                </button>
                <button
                  onClick={() => review('rejected')}
                  disabled={acting}
                  className="bg-red-600 text-white rounded px-3 py-1 text-xs disabled:opacity-50"
                >
                  不同意
                </button>
              </>
            )}
            {canDelete && (
              <button
                onClick={remove}
                disabled={acting}
                className="text-red-600 text-xs underline disabled:opacity-50 ml-auto"
              >
                {leaveRequest.status === 'rejected' ? '重來' : '刪除'}
              </button>
            )}
          </div>
        </div>
      ) : needsOvertimeChoice ? (
        <div>
          <p className="text-xs text-gray-500 mb-2">
            出勤已超出{otReport ? '額外出勤核准後的' : ''}緩衝上限，請先確認今日超額時間的性質，才能繼續請假申報：
          </p>
          {otReport && (
            <p className="text-xs text-gray-600 mb-2">
              今日已{otReport.status === 'approved' ? '核准' : otReport.status === 'rejected' ? '被駁回' : '送出待審'}
              額外出勤 {formatHours(otReport.requestedHours)} 小時
              {otReport.status === 'approved' ? '（已計入正常給薪上限）' : '（尚未核准，不計入正常給薪上限）'}
              ，仍有 {formatHours(unresolvedOtExcess)} 小時需要確認。
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {otReport && isOwner && (
              <button
                onClick={() => resolveOvertime('paid_as_overtime')}
                disabled={resolving}
                className="bg-amber-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
              >
                方案A：核算延工費{formatHours(unresolvedOtExcess)}小時
              </button>
            )}
            <button
              onClick={() => resolveOvertime('self_practice')}
              disabled={resolving}
              className="bg-gray-700 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
            >
              {otReport
                ? '方案B：自主練習，無延工事實'
                : resolving
                  ? '處理中…'
                  : '今日無額外出勤之事實，我同意剩餘時間為自主練習'}
            </button>
          </div>
        </div>
      ) : canDeclare || canUseManagerOverride ? (
        <div className="space-y-4">
          {canDeclare && (
            <div>
              <p className="text-xs text-gray-500 mb-2">正常流程：</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">假別</label>
                  <select
                    value={leaveTypeId}
                    onChange={(e) => setLeaveTypeId(e.target.value)}
                    className="border rounded px-2 py-1"
                  >
                    {leaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">申報方式</label>
                  <select
                    value={durationType}
                    onChange={(e) => setDurationType(e.target.value as DurationType)}
                    className="border rounded px-2 py-1"
                  >
                    <option value="full_day">全天</option>
                    <option value="partial">部分時數</option>
                  </select>
                </div>
                {durationType === 'partial' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">時數</label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      className="border rounded px-2 py-1 w-24"
                    />
                  </div>
                )}
                <button
                  onClick={submit}
                  disabled={submitting || !leaveTypeId}
                  className="bg-black text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {submitting ? '送出中…' : '送出申報'}
                </button>
              </div>
            </div>
          )}

          {canUseManagerOverride && (
            <div className={canDeclare ? 'pt-3 border-t' : undefined}>
              <p className="text-xs text-gray-500 mb-2">特殊流程：</p>
              <p className="text-xs text-gray-600 mb-2">
                今日上班 {formatClockTime(clockInAt)}，下班 {formatClockTime(clockOutAt)}，共{' '}
                {formatHours(rawHours)} 小時，請確認無誤後再核准。
              </p>
              <button
                onClick={submitOverride}
                disabled={overriding}
                className="bg-indigo-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50"
              >
                {overriding ? '處理中…' : '主管同意提早下班'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-400">尚未申報</p>
      )}
    </div>
  )
}
