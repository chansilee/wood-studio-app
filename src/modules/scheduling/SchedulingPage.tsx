import { useState } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import { OwnerScheduleEditor } from './OwnerScheduleEditor'
import { MyScheduleView } from './MyScheduleView'
import { CalendarOverridesManager } from './CalendarOverridesManager'
import { SchedulingSettings } from './SchedulingSettings'

type Tab = 'calendar' | 'overrides' | 'settings'

export function SchedulingPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [tab, setTab] = useState<Tab>('calendar')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">排班系統</h1>
        {isOwner && (
          <div className="flex gap-1">
            <button
              onClick={() => setTab('calendar')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'calendar' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              排班月曆
            </button>
            <button
              onClick={() => setTab('overrides')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'overrides' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              國定假日 / 特殊假管理
            </button>
            <button
              onClick={() => setTab('settings')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'settings' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              排班設定
            </button>
          </div>
        )}
      </div>

      {tab === 'calendar' ? (
        isOwner ? (
          <OwnerScheduleEditor />
        ) : (
          <MyScheduleView />
        )
      ) : tab === 'overrides' ? (
        <CalendarOverridesManager />
      ) : (
        <SchedulingSettings />
      )}
    </div>
  )
}
