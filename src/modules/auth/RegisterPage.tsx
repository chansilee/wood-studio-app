import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
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
        <h1 className="text-xl font-semibold mb-2">註冊完成</h1>
        <p className="text-gray-600 mb-4">
          請至信箱完成驗證。驗證後帳號預設為「訪客」身分，請聯絡工作室管理員開通權限。
        </p>
        <button className="underline" onClick={() => navigate('/login')}>
          前往登入
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto p-6 mt-12">
      <h1 className="text-xl font-semibold mb-4">註冊</h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          required
          placeholder="姓名"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="密碼（至少 6 碼）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {submitting ? '註冊中…' : '註冊'}
        </button>
      </form>
      <p className="text-sm text-gray-600 mt-4">
        已經有帳號？<Link to="/login" className="underline">前往登入</Link>
      </p>
    </div>
  )
}
