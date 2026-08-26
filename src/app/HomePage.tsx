import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const inMonthStartWindow = day <= 5

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
          .select('id, published_at')
          .eq('member_id', profile.id)
          .eq('year_month', `${ym}-01`)
          .order('published_at', { ascending: false })

        if (pubs && pubs.length > 0) {
          const latest = pubs[0]
          const { data: confirmation } = await supabase
            .from('schedule_confirmations')
            .select('id')
            .eq('publication_id', latest.id)
            .maybeSingle()

          if (!confirmation) {
            const monthNum = Number(ym.split('-')[1])
            const isFirst = pubs.length === 1
            items.push({
              id: `schedule-${ym}`,
              text: `您收到[${monthNum}月]排班表${isFirst ? '' : '更新'}，請進[排班系統]確認排班狀態`,
              colorClass: 'text-blue-700',
              sortKey: new Date(latest.published_at).getTime(),
            })
          }
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

      // 3. owner-only: pending leave requests awaiting review, grouped by member + month
      if (isOwner) {
        const { data: pendingLeaves } = await supabase
          .from('leave_requests')
          .select('member_id, leave_date')
          .eq('status', 'pending')

        if (pendingLeaves && pendingLeaves.length > 0) {
          const memberIds = Array.from(new Set(pendingLeaves.map((r) => r.member_id)))
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', memberIds)
          const nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]))

          const groups: Record<string, { memberId: string; month: string; count: number }> = {}
          for (const r of pendingLeaves) {
            const month = r.leave_date.slice(0, 7)
            const key = `${r.member_id}-${month}`
            groups[key] ??= { memberId: r.member_id, month, count: 0 }
            groups[key].count += 1
          }

          const now = Date.now()
          for (const g of Object.values(groups)) {
            const monthNum = Number(g.month.split('-')[1])
            const name = nameMap[g.memberId] ?? '未知成員'
            items.push({
              id: `leave-pending-${g.memberId}-${g.month}`,
              text: `你有[${g.count}]筆${name} - [${monthNum}月]待審核的請假，請至請假系統-該成員頁面進行審核`,
              colorClass: 'text-red-600 font-medium',
              sortKey: now,
            })
          }
        }
      }

      // 4. owner-only: month-start reminder to produce last month's settlement snapshot
      // for members flagged 必須計算月結, persists until that snapshot exists
      if (isOwner && inMonthStartWindow) {
        const targetYearMonth = addMonths(currentYearMonth, -1)
        const { data: mustCalculate } = await supabase
          .from('profiles')
          .select('id, display_name')
          .eq('must_calculate_settlement', true)

        if (mustCalculate && mustCalculate.length > 0) {
          const { data: snapshots } = await supabase
            .from('settlement_snapshots')
            .select('member_id')
            .eq('year_month', `${targetYearMonth}-01`)

          const doneIds = new Set((snapshots ?? []).map((s) => s.member_id))
          const missing = mustCalculate.filter((m) => !doneIds.has(m.id))
          const now = Date.now()
          const currentMonthNum = Number(currentYearMonth.split('-')[1])
          const targetMonthNum = Number(targetYearMonth.split('-')[1])
          for (const m of missing) {
            items.push({
              id: `settlement-${m.id}-${targetYearMonth}`,
              text: `已進入[${currentMonthNum}月]月初區間，您尚未產出[${m.display_name}]的[${targetMonthNum}月]月結，請至[月結系統]產出月結！`,
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
  }, [
    profile?.id,
    isOwner,
    orgSettings?.remind_month_end_publish,
    currentYearMonth,
    inMonthEndWindow,
    inMonthStartWindow,
  ])

  if (!profile || profile.role === 'guest') {
    return <GuestNotice />
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="text-xl font-semibold">
          歡迎回來，{profile.display_name}（{ROLE_LABELS[profile.role]}）
        </h1>
        <Link to="/notifications-help" className="text-xs text-blue-700 underline whitespace-nowrap">
          什麼時候通知？
        </Link>
      </div>
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
