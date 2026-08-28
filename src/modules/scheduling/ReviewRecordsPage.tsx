import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { formatDateTime } from '@/shared/lib/date'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import type { Tables } from '@/shared/types/database'

type Confirmation = Tables<'schedule_confirmations'> & {
  member_name?: string
  year_month?: string
}

export function ReviewRecordsPage() {
  const { settings } = useOrgSettings()
  const [records, setRecords] = useState<Confirmation[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('schedule_confirmations')
      .select('*')
      .order('confirmed_at', { ascending: false })

    const rows = data ?? []
    const memberIds = Array.from(new Set(rows.map((r) => r.member_id)))
    const pubIds = Array.from(new Set(rows.map((r) => r.publication_id)))

    const [{ data: profs }, { data: pubs }] = await Promise.all([
      memberIds.length > 0
        ? supabase.from('profiles').select('id, display_name, preferred_display_name').in('id', memberIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string; preferred_display_name: string | null }[] }),
      pubIds.length > 0
        ? supabase.from('schedule_publications').select('id, year_month').in('id', pubIds)
        : Promise.resolve({ data: [] as { id: string; year_month: string }[] }),
    ])

    const nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)]))
    const monthMap = Object.fromEntries((pubs ?? []).map((p) => [p.id, p.year_month]))

    setRecords(
      rows.map((r) => ({
        ...r,
        member_name: nameMap[r.member_id],
        year_month: monthMap[r.publication_id],
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const { error } = await supabase.from('schedule_confirmations').delete().eq('id', id)
    setDeletingId(null)
    if (!error) load()
  }

  const canDelete = !!settings && !settings.protect_review_records

  if (loading) return <div>載入中…</div>

  return (
    <div>
      <h2 className="font-medium mb-3">審閱紀錄</h2>
      {records.length === 0 ? (
        <p className="text-sm text-gray-400">目前沒有審閱紀錄</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-gray-600">
                <th className="py-2 pr-4">審閱時間</th>
                <th className="py-2 pr-4">審閱人</th>
                <th className="py-2 pr-4">公告月份</th>
                <th className="py-2 pr-4">公告記錄ID</th>
                <th className="py-2 pr-4">審閱結果</th>
                {canDelete && <th className="py-2 pr-4" />}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(r.confirmed_at)}</td>
                  <td className="py-2 pr-4">{r.member_name ?? '未知'}</td>
                  <td className="py-2 pr-4">{r.year_month ? r.year_month.slice(0, 7) : '未知'}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">{r.publication_id}</td>
                  <td className="py-2 pr-4">已確認</td>
                  {canDelete && (
                    <td className="py-2 pr-4">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
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
