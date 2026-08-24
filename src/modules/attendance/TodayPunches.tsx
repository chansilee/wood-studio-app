import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { nextDateStr, pad2, todayStr } from '@/shared/lib/date'
import type { Enums } from '@/shared/types/database'

interface PunchRow {
  id: string
  event_type: Enums<'attendance_event_type'>
  occurred_at: string
}

function formatTimeWithSeconds(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function TodayPunches({
  memberId,
  memberName,
  canDelete,
  refreshKey,
  onDeleted,
}: {
  memberId: string
  memberName: string
  canDelete: boolean
  refreshKey: number
  onDeleted?: () => void
}) {
  const [rows, setRows] = useState<PunchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const today = todayStr()
    const start = `${today}T00:00:00+08:00`
    const end = `${nextDateStr(today)}T00:00:00+08:00`
    const { data } = await supabase
      .from('attendance_events')
      .select('id, event_type, occurred_at')
      .eq('member_id', memberId)
      .gte('occurred_at', start)
      .lt('occurred_at', end)
      .order('occurred_at', { ascending: true })
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, refreshKey])

  const remove = async (id: string) => {
    setDeletingId(id)
    setError(null)
    const { error } = await supabase.from('attendance_events').delete().eq('id', id)
    setDeletingId(null)
    if (error) {
      setError(`刪除失敗：${error.message}`)
      return
    }
    load()
    onDeleted?.()
  }

  return (
    <div className="mb-6">
      <h2 className="font-medium mb-2">本日打卡紀錄：</h2>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {loading ? (
        <div>載入中…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">&lt;本日無打卡紀錄&gt;</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1 pr-4">打卡時間</th>
                <th className="py-1 pr-4">打卡型態</th>
                <th className="py-1 pr-4">打卡成員</th>
                {canDelete && <th className="py-1"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-1 pr-4">{formatTimeWithSeconds(r.occurred_at)}</td>
                  <td className="py-1 pr-4">{r.event_type === 'clock_in' ? '上班' : '下班'}</td>
                  <td className="py-1 pr-4">{memberName}</td>
                  {canDelete && (
                    <td className="py-1">
                      <button
                        onClick={() => remove(r.id)}
                        disabled={deletingId === r.id}
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
    </div>
  )
}
