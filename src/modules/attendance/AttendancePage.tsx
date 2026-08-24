import { useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import { ClockInOut } from './ClockInOut'
import { TodayPunches } from './TodayPunches'
import { AttendanceHistory } from './AttendanceHistory'
import { AttendanceSettings } from './AttendanceSettings'
import type { Tables } from '@/shared/types/database'

type Profile = Tables<'profiles'>
type Tab = 'clock' | 'settings'

export function AttendancePage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [tab, setTab] = useState<Tab>('clock')
  const [refreshKey, setRefreshKey] = useState(0)
  const [members, setMembers] = useState<Profile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const [allowDeleteRecords, setAllowDeleteRecords] = useState(false)

  useEffect(() => {
    if (!isOwner || !profile) return
    supabase
      .from('profiles')
      .select('*')
      .in('role', ['owner', 'staff'])
      .order('display_name')
      .then(({ data }) => {
        setMembers(data ?? [])
        setSelectedMemberId((prev) => prev || profile.id)
      })
  }, [isOwner, profile])

  useEffect(() => {
    if (!isOwner) return
    supabase
      .from('org_settings')
      .select('allow_delete_records')
      .eq('id', 1)
      .single()
      .then(({ data }) => setAllowDeleteRecords(data?.allow_delete_records ?? false))
  }, [isOwner, tab])

  const viewingMemberId = isOwner ? selectedMemberId : profile?.id ?? ''
  const viewingMember = isOwner ? members.find((m) => m.id === viewingMemberId) : profile
  const isViewingSelf = viewingMemberId === profile?.id

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
          {isOwner && (
            <div className="mb-4">
              <label className="block text-xs text-gray-600 mb-1">成員</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="border rounded px-2 py-1"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                    {m.id === profile?.id ? '（我）' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isViewingSelf && <ClockInOut onRecorded={() => setRefreshKey((k) => k + 1)} />}

          {viewingMemberId && viewingMember && (
            <>
              <TodayPunches
                memberId={viewingMemberId}
                memberName={viewingMember.display_name}
                canDelete={isOwner && allowDeleteRecords}
                refreshKey={refreshKey}
                onDeleted={() => setRefreshKey((k) => k + 1)}
              />
              <AttendanceHistory memberId={viewingMemberId} refreshKey={refreshKey} />
            </>
          )}
        </>
      ) : (
        <AttendanceSettings />
      )}
    </div>
  )
}
