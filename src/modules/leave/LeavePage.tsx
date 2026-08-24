import { useState } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import { LeaveCalendar } from './LeaveCalendar'
import { LeaveTypesManager } from './LeaveTypesManager'

type Tab = 'calendar' | 'types'

export function LeavePage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [tab, setTab] = useState<Tab>('calendar')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">請假系統</h1>
        {isOwner && (
          <div className="flex gap-1">
            <button
              onClick={() => setTab('calendar')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'calendar' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              請假月曆
            </button>
            <button
              onClick={() => setTab('types')}
              className={`px-3 py-1.5 rounded text-sm ${
                tab === 'types' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
              }`}
            >
              假別管理
            </button>
          </div>
        )}
      </div>

      {tab === 'calendar' ? <LeaveCalendar /> : <LeaveTypesManager />}
    </div>
  )
}
