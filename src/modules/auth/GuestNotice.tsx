import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'

export function GuestNotice() {
  const { profile, refreshProfile } = useAuth()
  const [canBootstrap, setCanBootstrap] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('has_any_owner').then(({ data }) => {
      setCanBootstrap(data === false)
    })
  }, [])

  const claimOwner = async () => {
    if (!profile) return
    setClaiming(true)
    setError(null)
    const { error } = await supabase.from('profiles').update({ role: 'owner' }).eq('id', profile.id)
    setClaiming(false)
    if (error) {
      setError(error.message)
      return
    }
    await refreshProfile()
  }

  return (
    <div className="p-6 max-w-md mx-auto text-center">
      <h2 className="text-lg font-semibold mb-2">尚無使用權限</h2>
      <p className="text-gray-600">
        您的帳號目前是「訪客」身分，尚未被管理員開通功能權限。
        請聯絡工作室管理員（負責人）協助提升權限。
      </p>
      {canBootstrap && (
        <div className="mt-6 border-t pt-4">
          <p className="text-sm text-gray-600 mb-2">
            系統偵測到目前工作室還沒有任何「負責人」帳號。若您就是工作室負責人，可以在此設定自己為第一位負責人（僅限一次，之後其他人的身分都要由負責人在成員管理頁指派）。
          </p>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          <button
            onClick={claimOwner}
            disabled={claiming}
            className="bg-black text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {claiming ? '設定中…' : '設定自己為負責人'}
          </button>
        </div>
      )}
    </div>
  )
}
