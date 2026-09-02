import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { formatDateTime } from '@/shared/lib/date'
import { AttendanceTermsContent } from './AttendanceTermsContent'
import type { Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>

export function AttendanceTermsRecordDetailPage() {
  const { memberId } = useParams<{ memberId: string }>()
  const [member, setMember] = useState<Profile | null>(null)
  const [acknowledgedTimes, setAcknowledgedTimes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!memberId) return
    setLoading(true)
    Promise.all([
      supabase.from('profiles').select('*').eq('id', memberId).single(),
      supabase
        .from('attendance_terms_acknowledgments')
        .select('acknowledged_at')
        .eq('member_id', memberId)
        .order('acknowledged_at', { ascending: false }),
    ]).then(([{ data: m }, { data: acks }]) => {
      setMember(m ?? null)
      setAcknowledgedTimes((acks ?? []).map((a) => a.acknowledged_at))
      setLoading(false)
    })
  }, [memberId])

  if (loading) return <div className="p-6">載入中…</div>
  if (!member) return <div className="p-6">找不到這位成員</div>

  const latest = acknowledgedTimes[0]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4 print:hidden">
        <h1 className="text-xl font-semibold">確認條款紀錄</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="text-xs bg-black text-white rounded px-3 py-1.5 whitespace-nowrap"
          >
            列印
          </button>
          <Link to="/attendance-terms/records" className="text-xs text-blue-700 underline whitespace-nowrap">
            返回列表
          </Link>
        </div>
      </div>

      <h1 className="hidden print:block text-xl font-semibold mb-4">員工線上打卡與工作時間確認條款</h1>

      {latest ? (
        <p className="text-sm bg-green-50 border border-green-200 text-green-800 rounded px-3 py-2 mb-4">
          員工：{effectiveDisplayName(member)}（{member.email}）　已於 {formatDateTime(latest)} 詳閱並同意本確認條款。
        </p>
      ) : (
        <p className="text-sm bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 mb-4">
          員工：{effectiveDisplayName(member)}（{member.email}）　尚未詳閱並同意本確認條款。
        </p>
      )}

      <AttendanceTermsContent />

      {acknowledgedTimes.length > 1 && (
        <div className="mt-6 text-xs text-gray-500">
          <p className="font-medium mb-1">歷次確認紀錄：</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {acknowledgedTimes.map((t) => (
              <li key={t}>{formatDateTime(t)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
