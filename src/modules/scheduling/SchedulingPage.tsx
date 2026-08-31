import { useState } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import { OwnerScheduleEditor } from './OwnerScheduleEditor'
import { BrowseScheduleView } from './BrowseScheduleView'
import { SchedulingPreferenceView } from './SchedulingPreferenceView'
import { CalendarOverridesManager } from './CalendarOverridesManager'
import { SchedulingSettings } from './SchedulingSettings'
import { ReviewRecordsPage } from './ReviewRecordsPage'

type Tab = 'edit' | 'browse' | 'overrides' | 'settings' | 'reviews' | 'preference'

export function SchedulingPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [ownerTab, setOwnerTab] = useState<Tab>('edit')
  const [memberTab, setMemberTab] = useState<Tab>('browse')
  const tab = isOwner ? ownerTab : memberTab
  const setTab = isOwner ? setOwnerTab : setMemberTab
  const effectiveTab = tab

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl font-semibold">排班系統</h1>
        <div className="flex gap-1 flex-wrap">
          {isOwner ? (
            <>
              <button
                onClick={() => setTab('edit')}
                className={`px-3 py-1.5 rounded text-sm ${
                  tab === 'edit' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                排班模式
              </button>
              <button
                onClick={() => setTab('browse')}
                className={`px-3 py-1.5 rounded text-sm ${
                  tab === 'browse' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                瀏覽模式
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
              <button
                onClick={() => setTab('reviews')}
                className={`px-3 py-1.5 rounded text-sm ${
                  tab === 'reviews' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                審閱紀錄
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setTab('preference')}
                className={`px-3 py-1.5 rounded text-sm ${
                  tab === 'preference' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                排班喜好
              </button>
              <button
                onClick={() => setTab('browse')}
                className={`px-3 py-1.5 rounded text-sm ${
                  tab === 'browse' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                瀏覽模式
              </button>
            </>
          )}
        </div>
      </div>

      {effectiveTab === 'edit' ? (
        <OwnerScheduleEditor />
      ) : effectiveTab === 'browse' ? (
        <BrowseScheduleView />
      ) : effectiveTab === 'overrides' ? (
        <CalendarOverridesManager />
      ) : effectiveTab === 'settings' ? (
        <SchedulingSettings />
      ) : effectiveTab === 'preference' ? (
        <SchedulingPreferenceView />
      ) : (
        <ReviewRecordsPage />
      )}
    </div>
  )
}
