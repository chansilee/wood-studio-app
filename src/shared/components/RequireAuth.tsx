import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="p-6">載入中…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
