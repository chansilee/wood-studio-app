import { useEffect, useState } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { ROLE_LABELS } from '@/shared/constants/roles'
import { GuestNotice } from '@/modules/auth/GuestNotice'
import { addMonths, todayStr } from '@/shared/lib/date'

export function HomePage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { settings: orgSettings } = useOrgSettings()
  const [missingMembers, setMissingMembers] = useState<string[]>([])

  const today = todayStr()
  const [, month, day] = today.split('-').map(Number)
  const inMonthEndWindow = day >= 25

  useEffect(() => {
    if (!isOwner || !orgSettings?.remind_month_end_publish || !inMonthEndWindow) {
      setMissingMembers([])
      return
    }

    const nextYearMonth = addMonths(today.slice(0, 7), 1)

    const check = async () => {
      const { data: mustPublish } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('must_publish_schedule', true)

      if (!mustPublish || mustPublish.length === 0) {
        setMissingMembers([])
        return
      }

      const { data: pubs } = await supabase
        .from('schedule_publications')
        .select('member_id')
        .eq('year_month', `${nextYearMonth}-01`)

      const publishedIds = new Set((pubs ?? []).map((p) => p.member_id))
      setMissingMembers(mustPublish.filter((m) => !publishedIds.has(m.id)).map((m) => m.display_name))
    }

    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, orgSettings?.remind_month_end_publish, inMonthEndWindow])

  if (!profile || profile.role === 'guest') {
    return <GuestNotice />
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">
        歡迎回來，{profile.display_name}（{ROLE_LABELS[profile.role]}）
      </h1>
      <p className="text-gray-600">從上方導覽選擇要使用的功能。</p>

      {missingMembers.length > 0 && (
        <div className="mt-4 space-y-1">
          {missingMembers.map((name) => (
            <p key={name} className="text-red-600 font-medium">
              已進入 [{month}月] 月底區間，您尚未對 [{name}] 公告下個月班表，請留意盡早編輯公告！
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
