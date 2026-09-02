import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { formatDateSlash, formatDateTime } from '@/shared/lib/date'
import { formatHours } from '@/modules/leave/leaveDisplay'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { formatMoney } from './MonthlySettlementPage'
import type { Tables } from '@/shared/types/database'

type SnapshotRow = Tables<'settlement_snapshots'> & { member_name?: string; created_by_name?: string }
type SnapshotContentRow = {
  date: string
  rawHours: number
  // current generation (契約工時 redesign)
  clockInAt?: string | null
  clockOutAt?: string | null
  contractHours?: number
  contractLabel?: string
  statusNote?: string
  varianceLabel?: string
  overtimeConfirmationText?: string
  // previous generation (原始狀態/請假/預報額外出勤/延工事實 columns)
  leaveLabel?: string
  finalLabel?: string
  finalColor?: 'green' | 'blue' | 'red'
  overtimeStatus?: 'none' | 'pending' | 'approved' | 'rejected'
  overtimeApprovedHours?: number
  overtimeFact?: string
  paidHours?: number
  // oldest generation (規整上班時數 only)
  settledHours?: number
}
type SnapshotContent = {
  rows: SnapshotContentRow[]
  leaveTotals: Record<string, number>
  hourlyWage?: number | null
  leaveTypeMeta?: Record<string, { pay_coefficient: number; description: string }>
  totalWage?: number | null
  totalNormalRateHours?: number
  totalTier2Hours?: number
  totalTier3Hours?: number
  totalPaidHours?: number
  totalSettled?: number
}

const OVERTIME_TIER2_RATE = 1.33
const OVERTIME_TIER3_RATE = 1.66

function monthLabel(yearMonthDate: string): string {
  const [y, m] = yearMonthDate.slice(0, 7).split('-').map(Number)
  return `${y}年${m}月`
}

function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

export function SettlementArchive() {
  const [records, setRecords] = useState<SnapshotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('settlement_snapshots')
      .select('*')
      .order('created_at', { ascending: false })

    const rows = data ?? []
    const memberIds = Array.from(new Set(rows.flatMap((r) => [r.member_id, r.created_by])))
    const { data: profs } =
      memberIds.length > 0
        ? await supabase.from('profiles').select('id, display_name, preferred_display_name').in('id', memberIds)
        : { data: [] as { id: string; display_name: string; preferred_display_name: string | null }[] }
    const nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)]))

    setRecords(
      rows.map((r) => ({
        ...r,
        member_name: nameMap[r.member_id],
        created_by_name: nameMap[r.created_by],
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const { error } = await supabase.from('settlement_snapshots').delete().eq('id', id)
    setDeletingId(null)
    if (!error) {
      if (viewingId === id) setViewingId(null)
      load()
    }
  }

  const viewing = records.find((r) => r.id === viewingId)
  const viewingContent = viewing?.snapshot as SnapshotContent | undefined

  if (loading) return <div>載入中…</div>

  return (
    <div>
      <h2 className="font-medium mb-3">已過月結結算</h2>
      {records.length === 0 ? (
        <p className="text-sm text-gray-400">目前沒有已產出的月結鏡像</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="py-2 pr-4">結算時間</th>
                <th className="py-2 pr-4">結算月份</th>
                <th className="py-2 pr-4">人員</th>
                <th className="py-2 pr-4" />
                <th className="py-2 pr-4" />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{monthLabel(r.year_month)}</td>
                  <td className="py-2 pr-4">{r.member_name ?? '未知'}</td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => setViewingId(viewingId === r.id ? null : r.id)}
                      className="text-blue-700 text-xs underline"
                    >
                      {viewingId === r.id ? '收合內容' : '點擊查看內容'}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id}
                      className="text-red-600 text-xs underline disabled:opacity-50"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && viewingContent && (
        <div className="mt-4 border rounded p-4 bg-gray-50">
          <p className="text-sm text-gray-600 mb-3">
            {viewing.member_name ?? '未知'}　{monthLabel(viewing.year_month)} 月結鏡像　由{' '}
            {viewing.created_by_name ?? '未知'} 於 {formatDateTime(viewing.created_at)} 產出
          </p>
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-4">日期</th>
                  <th className="py-1 pr-4">上班打卡</th>
                  <th className="py-1 pr-4">下班打卡</th>
                  <th className="py-1 pr-4">實際停留時數</th>
                  <th className="py-1 pr-4">契約工時</th>
                  <th className="py-1 pr-4">請假 / 出勤狀況註記</th>
                  <th className="py-1 pr-4">超出/不足時數</th>
                  <th className="py-1 pr-4">延工 / 自主時間確認</th>
                  <th className="py-1 pr-4">給薪時數</th>
                </tr>
              </thead>
              <tbody>
                {viewingContent.rows.map((row) => (
                  <tr key={row.date} className="border-b align-top">
                    <td className="py-1 pr-4 whitespace-nowrap">{formatDateSlash(row.date)}</td>
                    <td className="py-1 pr-4 whitespace-nowrap">{formatClockTime(row.clockInAt)}</td>
                    <td className="py-1 pr-4 whitespace-nowrap">{formatClockTime(row.clockOutAt)}</td>
                    <td className="py-1 pr-4 whitespace-nowrap">{formatHours(row.rawHours)}小時</td>
                    <td className="py-1 pr-4 whitespace-nowrap">
                      {row.contractLabel ?? (row.contractHours != null ? `${formatHours(row.contractHours)}小時` : '—')}
                    </td>
                    <td
                      className={`py-1 pr-4 ${
                        row.finalColor === 'green'
                          ? 'text-green-700'
                          : row.finalColor === 'blue'
                            ? 'text-blue-700'
                            : row.finalColor === 'red'
                              ? 'text-red-600'
                              : ''
                      }`}
                    >
                      {row.statusNote ?? row.finalLabel ?? row.leaveLabel ?? '—'}
                    </td>
                    <td className="py-1 pr-4 whitespace-nowrap">{row.varianceLabel ?? '—'}</td>
                    <td className="py-1 pr-4">
                      {row.overtimeConfirmationText ??
                        (row.overtimeStatus === 'approved'
                          ? `已核准 ${formatHours(row.overtimeApprovedHours ?? 0)}小時`
                          : row.overtimeFact?.trim() || '—')}
                    </td>
                    <td className="py-1 pr-4 whitespace-nowrap">
                      {formatHours(row.paidHours ?? row.settledHours ?? 0)}小時
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-sm space-y-1">
            {viewingContent.totalNormalRateHours != null ? (
              <>
                <p>
                  給薪時數（原費率）：{formatHours(viewingContent.totalNormalRateHours)}小時
                  {viewingContent.hourlyWage != null && (
                    <>
                      {' '}
                      x 時薪${formatMoney(viewingContent.hourlyWage)} = $
                      {formatMoney(viewingContent.totalNormalRateHours * viewingContent.hourlyWage)}
                    </>
                  )}
                </p>
                {(viewingContent.totalTier2Hours ?? 0) > 0 && (
                  <p>
                    給薪時數（1.33倍）：{formatHours(viewingContent.totalTier2Hours ?? 0)}小時
                    {viewingContent.hourlyWage != null && (
                      <>
                        {' '}
                        x 時薪${formatMoney(viewingContent.hourlyWage * OVERTIME_TIER2_RATE)} = $
                        {formatMoney(
                          (viewingContent.totalTier2Hours ?? 0) * viewingContent.hourlyWage * OVERTIME_TIER2_RATE
                        )}
                      </>
                    )}
                  </p>
                )}
                {(viewingContent.totalTier3Hours ?? 0) > 0 && (
                  <p>
                    給薪時數（1.66倍）：{formatHours(viewingContent.totalTier3Hours ?? 0)}小時
                    {viewingContent.hourlyWage != null && (
                      <>
                        {' '}
                        x 時薪${formatMoney(viewingContent.hourlyWage * OVERTIME_TIER3_RATE)} = $
                        {formatMoney(
                          (viewingContent.totalTier3Hours ?? 0) * viewingContent.hourlyWage * OVERTIME_TIER3_RATE
                        )}
                      </>
                    )}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  給薪時數合計：{formatHours(viewingContent.totalPaidHours ?? 0)}小時
                </p>
              </>
            ) : (
              <p className="font-medium">
                規整上班時數：{formatHours(viewingContent.totalSettled ?? 0)}小時
                {viewingContent.hourlyWage != null && (
                  <>
                    {' '}
                    x 時薪${formatMoney(viewingContent.hourlyWage)} = $
                    {formatMoney((viewingContent.totalSettled ?? 0) * viewingContent.hourlyWage)}
                  </>
                )}
              </p>
            )}
            {Object.entries(viewingContent.leaveTotals).map(([name, hours]) => {
              const meta = viewingContent.leaveTypeMeta?.[name]
              const perHourWage =
                meta && viewingContent.hourlyWage != null ? viewingContent.hourlyWage * meta.pay_coefficient : null
              return (
                <p key={name}>
                  {name}：{formatHours(hours)}小時
                  {perHourWage != null && (
                    <>
                      {' '}
                      x 時薪${formatMoney(perHourWage)}
                      {meta?.description ? ` (${meta.description})` : ''} = ${formatMoney(hours * perHourWage)}
                    </>
                  )}
                </p>
              )
            })}
            {viewingContent.totalWage != null && (
              <>
                <hr className="my-2 border-gray-300" />
                <p className="font-medium">
                  {Number(viewing.year_month.slice(5, 7))}月全部本薪薪資：${formatMoney(viewingContent.totalWage)}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
