import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { ROLE_LABELS } from '@/shared/constants/roles'
import { effectiveDisplayName } from '@/shared/lib/displayName'

const navItemClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded text-sm ${isActive ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'}`

export function Layout() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">木雕工作室管理系統</div>
        <nav className="flex flex-wrap gap-1">
          <NavLink to="/" end className={navItemClass}>首頁</NavLink>
          <NavLink to="/scheduling" className={navItemClass}>排班系統</NavLink>
          <NavLink to="/attendance" className={navItemClass}>打卡系統</NavLink>
          <NavLink to="/leave" className={navItemClass}>請假系統</NavLink>
          <NavLink to="/settlement" className={navItemClass}>月結系統</NavLink>
          <NavLink to="/journal" className={navItemClass}>日誌系統</NavLink>
          <NavLink to="/products" className={navItemClass}>產品參考</NavLink>
          {isOwner && <NavLink to="/members" className={navItemClass}>成員管理</NavLink>}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          {profile && (
            <span>
              {effectiveDisplayName(profile)}（{ROLE_LABELS[profile.role]}）
            </span>
          )}
          <button onClick={() => supabase.auth.signOut()} className="underline">
            登出
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
