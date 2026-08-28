import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'

export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="max-w-sm mx-auto p-6 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">密碼已重設</h1>
        <p className="text-gray-600 mb-4">請用新密碼登入。</p>
        <button className="underline" onClick={() => navigate('/')}>
          進入系統
        </button>
      </div>
    )
  }

  if (loading) {
    return <div className="max-w-sm mx-auto p-6 mt-12 text-center text-gray-500">載入中…</div>
  }

  if (!session) {
    return (
      <div className="max-w-sm mx-auto p-6 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">連結無效或已過期</h1>
        <p className="text-gray-600 mb-4">請重新申請一次忘記密碼信件。</p>
        <button className="underline" onClick={() => navigate('/forgot-password')}>
          重新申請
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto p-6 mt-12">
      <h1 className="text-xl font-semibold mb-4">設定新密碼</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          required
          minLength={6}
          placeholder="新密碼（至少 6 碼）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="再次輸入新密碼"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {submitting ? '儲存中…' : '重設密碼'}
        </button>
      </form>
    </div>
  )
}
