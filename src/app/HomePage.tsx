import { useEffect, useState } from 'react'
import { useAuth } from '@/shared/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { ROLE_LABELS } from '@/shared/constants/roles'
import { GuestNotice } from '@/modules/auth/GuestNotice'
import { addMonths, todayStr } from '@/shared/lib/date'

interface NotificationItem {
  id: string
  text: string
  colorClass: string
  sortKey: number
}

export function HomePage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { settings: orgSettings } = useOrgSettings()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const today = todayStr()
  const day = Number(today.slice(8, 10))
  const currentYearMonth = today.slice(0, 7)
  const inMonthEndWindow = day >= 25

  useEffect(() => {
    if (!profile || profile.role === 'guest') return

    const build = async () => {
      const items: NotificationItem[] = []

      // 1. "you received a schedule" for the viewer's own member_id.
      // Relevant months: this month always, next month once we're past the 25th.
      const relevantMonths = [currentYearMonth]
      if (inMonthEndWindow) relevantMonths.push(addMonths(currentYearMonth, 1))

      for (const ym of relevantMonths) {
        const { data: pubs } = await supabase
          .from('schedule_publications')
          .select('published_at')
          .eq('member_id', profile.id)
          .eq('year_month', `${ym}-01`)
          .order('published_at', { ascending: false })

        if (pubs && pubs.length > 0) {
          const monthNum = Number(ym.split('-')[1])
          const isFirst = pubs.length === 1
          items.push({
            id: `schedule-${ym}`,
            text: `您收到[${monthNum}月]排班表${isFirst ? '' : '更新'}，請進[排班系統]確認排班狀態`,
            colorClass: 'text-blue-700',
            sortKey: new Date(pubs[0].published_at).getTime(),
          })
        }
      }

      // 2. owner-only: month-end reminder for must-publish members missing next month's publication
      if (isOwner && orgSettings?.remind_month_end_publish && inMonthEndWindow) {
        const nextYearMonth = addMonths(currentYearMonth, 1)
        const { data: mustPublish } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('must_publish_schedule', true)

        if (mustPublish && mustPublish.length > 0) {
          const { data: pubs } = await supabase
            .from('schedule_publications')
            .select('member_id')
            .eq('year_month', `${nextYearMonth}-01`)

          const publishedIds = new Set((pubs ?? []).map((p) => p.member_id))
          const missing = mustPublish.filter((m) => !publishedIds.has(m.id))
          const now = Date.now()
          const currentMonthNum = Number(currentYearMonth.split('-')[1])
          for (const m of missing) {
            items.push({
              id: `remind-${m.id}`,
              text: `已進入[${currentMonthNum}月]月底區間，您尚未對[${m.display_name}]公告下個月班表，請留意盡早編輯公告！`,
              colorClass: 'text-red-600 font-medium',
              sortKey: now,
            })
          }
        }
      }

      items.sort((a, b) => b.sortKey - a.sortKey)
      setNotifications(items)
    }

    build()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, isOwner, orgSettings?.remind_month_end_publish, currentYearMonth, inMonthEndWindow])

  if (!profile || profile.role === 'guest') {
    return <GuestNotice />
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-2">
        歡迎回來，{profile.display_name}（{ROLE_LABELS[profile.role]}）
      </h1>
      <p className="text-gray-600 mb-6">從上方導覽選擇要使用的功能。</p>

      <h2 className="font-medium mb-2">通知中心</h2>
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-400">目前沒有新通知</p>
      ) : (
        <ul className="space-y-1">
          {notifications.map((n) => (
            <li key={n.id} className={`text-sm ${n.colorClass}`}>
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
