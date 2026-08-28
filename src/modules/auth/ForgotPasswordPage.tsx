import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/shared/lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    // no #route suffix here — HashRouter's own "#/..." would collide with the
    // "#access_token=...&type=recovery" fragment Supabase appends on redirect;
    // AuthProvider listens for the PASSWORD_RECOVERY event and navigates instead
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
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
        <h1 className="text-xl font-semibold mb-2">已寄出重設密碼信</h1>
        <p className="text-gray-600 mb-4">請至信箱查看，並點擊信件中的連結重設密碼。</p>
        <Link to="/login" className="underline">
          返回登入
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-sm mx-auto p-6 mt-12">
      <h1 className="text-xl font-semibold mb-4">忘記密碼</h1>
      <p className="text-sm text-gray-600 mb-4">輸入註冊時使用的 Email，我們會寄送重設密碼的連結給你。</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {submitting ? '寄送中…' : '寄送重設密碼信'}
        </button>
      </form>
      <p className="text-sm text-gray-600 mt-4">
        <Link to="/login" className="underline">
          返回登入
        </Link>
      </p>
    </div>
  )
}
