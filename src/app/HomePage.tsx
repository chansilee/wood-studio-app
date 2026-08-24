import { useAuth } from '@/shared/hooks/useAuth'
import { ROLE_LABELS } from '@/shared/constants/roles'
import { GuestNotice } from '@/modules/auth/GuestNotice'

export function HomePage() {
  const { profile } = useAuth()

  if (!profile || profile.role === 'guest') {
    return <GuestNotice />
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">
        歡迎回來，{profile.display_name}（{ROLE_LABELS[profile.role]}）
      </h1>
      <p className="text-gray-600">從上方導覽選擇要使用的功能。</p>
    </div>
  )
}
