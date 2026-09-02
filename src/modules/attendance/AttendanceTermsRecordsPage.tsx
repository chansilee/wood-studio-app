import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { formatDateTime } from '@/shared/lib/date'
import { isSelectableMember } from '@/shared/lib/members'
import type { Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>

interface Row {
  member: Profile
  acknowledgedAt: string | null
}

export function AttendanceTermsRecordsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: members } = await supabase.from('profiles').select('*').eq('role', 'staff').order('display_name')
      const selectable = (members ?? []).filter(isSelectableMember)
      const memberIds = selectable.map((m) => m.id)
      const { data: acks } =
        memberIds.length > 0
          ? await supabase
              .from('attendance_terms_acknowledgments')
              .select('member_id, acknowledged_at')
              .in('member_id', memberIds)
              .order('acknowledged_at', { ascending: false })
          : { data: [] as { member_id: string; acknowledged_at: string }[] }
      const ackMap: Record<string, string> = {}
      for (const a of acks ?? []) {
        // rows are newest-first, so the first one seen per member is the latest
        ackMap[a.member_id] ??= a.acknowledged_at
      }
      setRows(selectable.map((m) => ({ member: m, acknowledgedAt: ackMap[m.id] ?? null })))
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold">員工確認條款紀錄</h1>
        <Link to="/attendance" className="text-xs text-blue-700 underline whitespace-nowrap">
          返回打卡系統
        </Link>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        每位員工是否已詳閱並同意〈員工線上打卡與工作時間確認條款〉的紀錄。如遇勞資爭議，可點「查看/列印」調出該員工的確認紀錄。
      </p>

      {loading ? (
        <div className="text-sm text-gray-500">載入中…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">目前沒有正式員工帳號</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">員工</th>
                <th className="py-2 pr-4">確認狀態</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.member.id} className="border-b">
                  <td className="py-2 pr-4">{effectiveDisplayName(r.member)}</td>
                  <td className="py-2 pr-4">
                    {r.acknowledgedAt ? (
                      <span className="text-green-700">已於 {formatDateTime(r.acknowledgedAt)} 同意</span>
                    ) : (
                      <span className="text-red-600">尚未同意</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {r.acknowledgedAt && (
                      <Link
                        to={`/attendance-terms/records/${r.member.id}`}
                        className="text-blue-700 text-xs underline whitespace-nowrap"
                      >
                        查看/列印
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
