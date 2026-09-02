import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { formatDateTime } from '@/shared/lib/date'
import { AttendanceTermsContent } from './AttendanceTermsContent'

export function AttendanceTermsPage() {
  const { profile } = useAuth()
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase
      .from('attendance_terms_acknowledgments')
      .select('acknowledged_at')
      .eq('member_id', profile.id)
      .order('acknowledged_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setAcknowledgedAt(data?.acknowledged_at ?? null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  const acknowledge = async () => {
    if (!profile) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase
      .from('attendance_terms_acknowledgments')
      .insert({ member_id: profile.id })
    setSubmitting(false)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    load()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold">員工線上打卡與工作時間確認條款</h1>
        <Link to="/attendance" className="text-xs text-blue-700 underline whitespace-nowrap">
          返回打卡系統
        </Link>
      </div>

      {!loading && acknowledgedAt && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-4">
          您已於 {formatDateTime(acknowledgedAt)} 詳閱並同意本確認條款。
        </p>
      )}

      <AttendanceTermsContent />

      {!loading && !acknowledgedAt && (
        <div className="mt-8 border-t pt-4">
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          <label className="flex items-start gap-2 text-sm mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5"
            />
            我已詳閱、理解並同意上述所有關於出勤打卡與工作時間之規範。
          </label>
          <button
            onClick={acknowledge}
            disabled={!checked || submitting}
            className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? '送出中…' : '【已詳閱並同意遵守本確認條款】'}
          </button>
        </div>
      )}
    </div>
  )
}
