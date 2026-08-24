import type { ReactNode } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import type { MemberRole } from '@/shared/constants/roles'
import { GuestNotice } from '@/modules/auth/GuestNotice'

export function RequireRole({ allow, children }: { allow: MemberRole[]; children: ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="p-6">載入中…</div>
  if (!profile || profile.role === 'guest' || !allow.includes(profile.role)) {
    return <GuestNotice />
  }
  return <>{children}</>
}
