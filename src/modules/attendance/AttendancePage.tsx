import { useState } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import { ClockInOut } from './ClockInOut'
import { AttendanceHistory } from './AttendanceHistory'
import { AttendanceSettings } from './AttendanceSettings'

type Tab = 'clock' | 'settings'

export function AttendancePage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [tab, setTab] = useState<Tab>('clock')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">打卡系統</h1>
        {isOwner && (
          <div className="flex gap-1">
            <button
              onClick={() => setTab('clock')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'clock' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              打卡
            </button>
            <button
              onClick={() => setTab('settings')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'settings' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              設定
            </button>
          </div>
        )}
      </div>

      {tab === 'clock' ? (
        <>
          <ClockInOut onRecorded={() => setRefreshKey((k) => k + 1)} />
          <AttendanceHistory refreshKey={refreshKey} />
        </>
      ) : (
        <AttendanceSettings />
      )}
    </div>
  )
}
