import { useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { formatDateTime } from '@/shared/lib/date'
import { LEAVE_DURATION_TYPE_LABELS } from '@/shared/constants/roles'
import { computeLeaveDisplay, formatHours } from './leaveDisplay'
import type { Enums, Tables, TablesInsert } from '@/shared/types/database'

type LeaveType = Tables<'leave_types'>
type LeaveRequestRow = Tables<'leave_requests'> & {
  leave_type_name?: string
  reviewer_name?: string
}
type DurationType = Enums<'leave_duration_type'>

export function LeaveDetailPanel({
  date,
  memberId,
  isOwner,
  canDeclare,
  canUseManagerOverride,
  allowDeleteRecords,
  leaveRequest,
  rawStatus,
  rawHours,
  defaultDailyHours,
  leaveTypes,
  onChanged,
  onClose,
}: {
  date: string
  memberId: string
  isOwner: boolean
  canDeclare: boolean
  /** owner-only: this day is abnormal attendance and has no existing leave/override record yet */
  canUseManagerOverride: boolean
  /** org_settings.allow_delete_records — gates deletion of manager-override records */
  allowDeleteRecords: boolean
  leaveRequest?: LeaveRequestRow
  rawStatus: 'normal' | 'abnormal'
  rawHours: number | null
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

  const submit = async () => {
    if (!profile || !leaveTypeId) return
    if (durationType === 'partial' && (!hours || Number(hours) <= 0)) {
      setError('請填寫請假時數')
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
      setError(`申報失敗：${error.message}`)
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
      setError(`操作失敗：${error.message}`)
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
      setError(`操作失敗：${error.message}`)
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
      setError(`刪除失敗：${error.message}`)
      return
    }
    onChanged()
  }

  const canDelete = leaveRequest
    ? leaveRequest.is_manager_override
      ? isOwner && allowDeleteRecords
      : isOwner || memberId === profile?.id
    : false

  return (
    <div className="border rounded p-4 bg-gray-50 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">{date}</h3>
        <button onClick={onClose} className="text-xs text-gray-500 underline">
          關閉
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      {leaveRequest ? (
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">
            原：正常班{' '}
            {rawStatus === 'abnormal' ? (
              <span className="text-red-600">＜出勤異常 {formatHours(rawHours)} 小時＞</span>
            ) : (
              <span className="text-green-700">＜出勤正常 {formatHours(rawHours)} 小時＞</span>
            )}
          </p>
          <p>
            申報：
            {leaveRequest.is_manager_override
              ? '主管同意提早下班'
              : `${leaveRequest.leave_type_name ?? '未知假別'} ${
                  leaveRequest.duration_type === 'full_day'
                    ? LEAVE_DURATION_TYPE_LABELS.full_day
                    : `${leaveRequest.hours} 小時`
                }`}
          </p>
          {leaveRequest.status === 'approved' &&
            (() => {
              const display = computeLeaveDisplay({
                isPast: true,
                rawStatus,
                rawHours,
                defaultDailyHours,
                leaveRequest,
              })
              return (
                <p className="text-xs text-gray-500">
                  顯示為：
                  <span className="font-medium">
                    {display.primaryLabel}
                    {display.secondaryLabel && (
                      <>
                        <br />
                        {display.secondaryLabel}
                      </>
                    )}
                  </span>
                </p>
              )
            })()}
          {!leaveRequest.is_manager_override && leaveRequest.duration_type === 'partial' && (
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
            {isOwner && leaveRequest.status === 'pending' && (
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
                刪除
              </button>
            )}
          </div>
        </div>
      ) : canDeclare || canUseManagerOverride ? (
        <div className="space-y-4">
          <p className="text-sm text-red-600">＜出勤異常 {formatHours(rawHours)} 小時＞</p>

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
