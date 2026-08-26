import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { daysInMonth, pad2, todayStr } from '@/shared/lib/date'
import type { Enums, Tables } from '@/shared/types/database'

type EventRow = Tables<'attendance_events'>
type ApprovalStatus = Enums<'attendance_approval_status'>

interface RowWithReviewer extends EventRow {
  reviewer_name?: string
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}/${mo}/${da} ${h}:${mi}:${s}`
}

function typeLabel(row: EventRow): string {
  const base = row.event_type === 'clock_in' ? '上班' : '下班'
  return row.is_backfill ? `補登${base}` : base
}

export function HistoricalPunches({
  memberId,
  yearMonth,
  canDelete,
  refreshKey,
  onChanged,
}: {
  memberId: string
  yearMonth: string
  canDelete: boolean
  refreshKey: number
  onChanged?: () => void
}) {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [rows, setRows] = useState<RowWithReviewer[]>([])
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const [year, month] = yearMonth.split('-').map(Number)

  const load = async () => {
    setLoading(true)
    const firstDay = `${year}-${pad2(month)}-01T00:00:00+08:00`
    const today = todayStr()
    const todayStart = `${today}T00:00:00+08:00`
    const dayAfterMonth = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}T23:59:59+08:00`
    const upperBound = todayStart < dayAfterMonth ? todayStart : dayAfterMonth

    const { data } = await supabase
      .from('attendance_events')
      .select('*')
      .eq('member_id', memberId)
      .gte('occurred_at', firstDay)
      .lt('occurred_at', upperBound)
      .order('occurred_at', { ascending: false })

    const eventRows = data ?? []
    const reviewerIds = Array.from(
      new Set(eventRows.map((r) => r.reviewed_by).filter((id): id is string => !!id))
    )
    let names: Record<string, string> = {}
    if (reviewerIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', reviewerIds)
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]))
    }
    setRows(
      eventRows.map((r) => ({ ...r, reviewer_name: r.reviewed_by ? names[r.reviewed_by] : undefined }))
    )
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, yearMonth, refreshKey])

  const review = async (id: string, status: ApprovalStatus) => {
    if (!profile) return
    setActingId(id)
    setError(null)
    const { error } = await supabase
      .from('attendance_events')
      .update({ approval_status: status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setActingId(null)
    if (error) {
      setError(`操作失敗：${error.message}`)
      return
    }
    load()
    onChanged?.()
  }

  const remove = async (id: string) => {
    setActingId(id)
    setError(null)
    const { error } = await supabase.from('attendance_events').delete().eq('id', id)
    setActingId(null)
    if (error) {
      setError(`刪除失敗：${error.message}`)
      return
    }
    load()
    onChanged?.()
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="font-medium">歷史打卡紀錄：</h2>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-blue-700 underline"
        >
          {expanded ? '[-收合]' : '[+展開]'}
        </button>
      </div>
      {expanded && (
        <>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          {loading ? (
            <div>載入中…</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400">本月尚無紀錄</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-1 pr-4">日期時間</th>
                    <th className="py-1 pr-4">型態</th>
                    <th className="py-1 pr-4">狀態</th>
                    {canDelete && <th className="py-1"></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b align-top">
                      <td className="py-1 pr-4 whitespace-nowrap">{formatDateTime(r.occurred_at)}</td>
                      <td className="py-1 pr-4 whitespace-nowrap">{typeLabel(r)}</td>
                      <td className="py-1 pr-4">
                        {!r.is_backfill ? (
                          <span className="text-gray-400">—</span>
                        ) : r.approval_status === 'pending' && isOwner ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => review(r.id, 'approved')}
                              disabled={actingId === r.id}
                              className="text-xs bg-green-600 text-white rounded px-2 py-1 disabled:opacity-50"
                            >
                              同意
                            </button>
                            <button
                              onClick={() => review(r.id, 'rejected')}
                              disabled={actingId === r.id}
                              className="text-xs bg-red-600 text-white rounded px-2 py-1 disabled:opacity-50"
                            >
                              不同意
                            </button>
                          </div>
                        ) : r.approval_status === 'pending' ? (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                            申報中
                          </span>
                        ) : (
                          <div>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                r.approval_status === 'approved'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {r.approval_status === 'approved' ? '已同意' : '不同意'}
                            </span>
                            {r.reviewed_by && r.reviewed_at && (
                              <p className="text-[11px] text-gray-500 mt-1">
                                {r.reviewer_name ?? '未知'} 於 {formatDateTime(r.reviewed_at)}
                                {r.approval_status === 'approved' ? '同意' : '不同意'}此申報
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      {canDelete && (
                        <td className="py-1">
                          <button
                            onClick={() => remove(r.id)}
                            disabled={actingId === r.id}
                            className="text-red-600 text-xs underline disabled:opacity-50"
                          >
                            刪除
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
