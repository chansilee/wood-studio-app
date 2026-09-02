import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { supabase } from '@/shared/lib/supabase'
import { useOrgSettings } from '@/shared/hooks/useOrgSettings'
import { ROLE_LABELS, LEAVE_DURATION_TYPE_LABELS } from '@/shared/constants/roles'
import { effectiveDisplayName } from '@/shared/lib/displayName'
import { GuestNotice } from '@/modules/auth/GuestNotice'
import { addMonths, formatDateSlash, formatDateTime, todayStr } from '@/shared/lib/date'
import { formatHours } from '@/modules/leave/leaveDisplay'

interface NotificationItem {
  id: string
  text: string
  colorClass: string
  sortKey: number
}

interface PendingBackfillItem {
  id: string
  occurred_at: string
  event_type: 'clock_in' | 'clock_out'
}

interface PendingLeaveItem {
  id: string
  leave_date: string
  leave_type_name: string
  duration_type: 'full_day' | 'partial'
  hours: number | null
  // null when that date's attendance hasn't happened/settled yet — the
  // qualifies-or-not suggestion only makes sense once there's a real number
  rawHours: number | null
  defaultDailyHours: number
}

interface PendingOvertimeItem {
  id: string
  member_name: string
  requested_hours: number
}

type ReviewBox =
  | { type: 'backfill'; items: PendingBackfillItem[] }
  | { type: 'leave'; items: PendingLeaveItem[] }
  | { type: 'overtime'; items: PendingOvertimeItem[] }

function PendingBackfillReviewBox({
  items,
  onChanged,
}: {
  items: PendingBackfillItem[]
  onChanged: () => void
}) {
  const { profile } = useAuth()
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const review = async (id: string, status: 'approved' | 'rejected') => {
    if (!profile) return
    setActingId(id)
    setError(null)
    const { error } = await supabase
      .from('attendance_events')
      .update({ approval_status: status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setActingId(null)
    if (error) {
      setError(`操作失敗：${error.message}`)
      return
    }
    onChanged()
  }

  return (
    <div className="ml-4 mt-1 mb-2 border rounded bg-white overflow-x-auto">
      {error && <p className="text-red-600 text-xs px-2 pt-1">{error}</p>}
      <table className="w-full text-xs border-collapse">
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b last:border-b-0">
              <td className="py-1 px-2 whitespace-nowrap">{formatDateTime(it.occurred_at)}</td>
              <td className="py-1 px-2 whitespace-nowrap">
                {it.event_type === 'clock_in' ? '補登上班' : '補登下班'}
              </td>
              <td className="py-1 px-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => review(it.id, 'approved')}
                    disabled={actingId === it.id}
                    className="text-xs bg-green-600 text-white rounded px-2 py-0.5 disabled:opacity-50"
                  >
                    同意
                  </button>
                  <button
                    onClick={() => review(it.id, 'rejected')}
                    disabled={actingId === it.id}
                    className="text-xs bg-red-600 text-white rounded px-2 py-0.5 disabled:opacity-50"
                  >
                    不同意
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PendingLeaveReviewBox({ items, onChanged }: { items: PendingLeaveItem[]; onChanged: () => void }) {
  const { profile } = useAuth()
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const review = async (id: string, status: 'approved' | 'rejected') => {
    if (!profile) return
    setActingId(id)
    setError(null)
    const { error } = await supabase
      .from('leave_requests')
      .update({ status, reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setActingId(null)
    if (error) {
      setError(`操作失敗：${error.message}`)
      return
    }
    onChanged()
  }

  return (
    <div className="ml-4 mt-1 mb-2 space-y-1">
      {error && <p className="text-red-600 text-xs px-1">{error}</p>}
      {items.map((it) => {
        const total = it.rawHours != null ? Number(it.rawHours) + Number(it.hours ?? 0) : null
        const qualifies = total != null ? total >= it.defaultDailyHours : null
        return (
          <div key={it.id} className="border rounded bg-white px-2 py-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="whitespace-nowrap">{formatDateSlash(it.leave_date)}</span>
              <span className="whitespace-nowrap">
                {it.leave_type_name}
                {it.duration_type === 'full_day'
                  ? LEAVE_DURATION_TYPE_LABELS.full_day
                  : `${formatHours(it.hours)}小時`}
              </span>
              <div className="flex gap-2 ml-auto flex-shrink-0">
                <button
                  onClick={() => review(it.id, 'approved')}
                  disabled={actingId === it.id}
                  className="text-xs bg-green-600 text-white rounded px-2 py-0.5 disabled:opacity-50"
                >
                  同意
                </button>
                <button
                  onClick={() => review(it.id, 'rejected')}
                  disabled={actingId === it.id}
                  className="text-xs bg-red-600 text-white rounded px-2 py-0.5 disabled:opacity-50"
                >
                  不同意
                </button>
              </div>
            </div>
            {it.duration_type === 'partial' && total != null && (
              <p className="text-gray-500 mt-0.5">
                原出勤時數 {formatHours(it.rawHours)} + 請假 {it.hours} 小時 = {total.toFixed(2)} 小時，約定工時{' '}
                {it.defaultDailyHours} 小時 → {qualifies ? '已達標，視為正常出勤' : '仍未達標，維持異常出勤'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PendingOvertimeReviewBox({ items, onChanged }: { items: PendingOvertimeItem[]; onChanged: () => void }) {
  const [actingId, setActingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const review = async (id: string, status: 'approved' | 'rejected') => {
    setActingId(id)
    setError(null)
    const { error } = await supabase.from('overtime_pre_reports').update({ status }).eq('id', id)
    setActingId(null)
    if (error) {
      setError(`提交錯誤：${error.message}`)
      return
    }
    onChanged()
  }

  return (
    <div className="ml-4 mt-1 mb-2 border rounded bg-white overflow-x-auto">
      {error && <p className="text-red-600 text-xs px-2 pt-1">{error}</p>}
      <table className="w-full text-xs border-collapse">
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b last:border-b-0">
              <td className="py-1 px-2 whitespace-nowrap">{it.member_name}</td>
              <td className="py-1 px-2 whitespace-nowrap">上限 {it.requested_hours} 小時</td>
              <td className="py-1 px-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => review(it.id, 'approved')}
                    disabled={actingId === it.id}
                    className="text-xs bg-green-600 text-white rounded px-2 py-0.5 disabled:opacity-50"
                  >
                    同意
                  </button>
                  <button
                    onClick={() => review(it.id, 'rejected')}
                    disabled={actingId === it.id}
                    className="text-xs bg-red-600 text-white rounded px-2 py-0.5 disabled:opacity-50"
                  >
                    不同意
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HomePage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { settings: orgSettings } = useOrgSettings()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [reviewBoxes, setReviewBoxes] = useState<Record<string, ReviewBox>>({})

  const today = todayStr()
  const day = Number(today.slice(8, 10))
  const currentYearMonth = today.slice(0, 7)
  const inMonthEndWindow = day >= 25
  const inMonthStartWindow = day <= 5

  const build = useCallback(async () => {
    if (!profile || profile.role === 'guest') return

    const items: NotificationItem[] = []
    const boxes: Record<string, ReviewBox> = {}

    // 1. "you received a schedule" for the viewer's own member_id.
      // Owners can publish any month (including pre-scheduling far in advance), so
      // check every month's latest publication rather than assuming just this/next month.
      const { data: allPubs } = await supabase
        .from('schedule_publications')
        .select('id, year_month, published_at')
        .eq('member_id', profile.id)
        .order('published_at', { ascending: false })

      if (allPubs && allPubs.length > 0) {
        const latestByMonth = new Map<string, { id: string; year_month: string; published_at: string }>()
        for (const p of allPubs) {
          if (!latestByMonth.has(p.year_month)) latestByMonth.set(p.year_month, p)
        }
        const latestPubs = Array.from(latestByMonth.values())
        const { data: confirmations } = await supabase
          .from('schedule_confirmations')
          .select('publication_id')
          .in(
            'publication_id',
            latestPubs.map((p) => p.id)
          )
        const confirmedIds = new Set((confirmations ?? []).map((c) => c.publication_id))

        for (const pub of latestPubs) {
          if (confirmedIds.has(pub.id)) continue
          const ym = pub.year_month.slice(0, 7)
          const monthNum = Number(ym.split('-')[1])
          const isFirst = allPubs.filter((p) => p.year_month === pub.year_month).length === 1
          items.push({
            id: `schedule-${ym}`,
            text: `您收到[${monthNum}月]排班表${isFirst ? '' : '更新'}，請進[排班系統]->[瀏覽模式]確認班表狀態`,
            colorClass: 'text-blue-700',
            sortKey: new Date(pub.published_at).getTime(),
          })
        }
      }

      // 2. owner-only: month-end reminder for must-publish members missing next month's publication
      if (isOwner && orgSettings?.remind_month_end_publish && inMonthEndWindow) {
        const nextYearMonth = addMonths(currentYearMonth, 1)
        const { data: mustPublish } = await supabase
          .from('profiles')
          .select('id, display_name, preferred_display_name')
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
              text: `已進入[${currentMonthNum}月]月底區間，您尚未對[${effectiveDisplayName(m)}]公告下個月班表，請留意盡早編輯公告！`,
              colorClass: 'text-red-600 font-medium',
              sortKey: now,
            })
          }
        }
      }

      // 3. owner-only: pending leave requests awaiting review, grouped by member + month,
      // with an inline approve/reject box rendered right under the notification line
      if (isOwner) {
        const { data: pendingLeaves } = await supabase
          .from('leave_requests')
          .select('id, member_id, leave_date, duration_type, hours, leave_types(name)')
          .eq('status', 'pending')

        if (pendingLeaves && pendingLeaves.length > 0) {
          const memberIds = Array.from(new Set(pendingLeaves.map((r) => r.member_id)))
          const leaveDates = Array.from(new Set(pendingLeaves.map((r) => r.leave_date)))
          const [{ data: profs }, { data: attRows }] = await Promise.all([
            supabase
              .from('profiles')
              .select('id, display_name, preferred_display_name, default_daily_hours')
              .in('id', memberIds),
            supabase
              .from('attendance_summary')
              .select('member_id, work_date, worked_hours')
              .in('member_id', memberIds)
              .in('work_date', leaveDates),
          ])
          const nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)]))
          const ddhMap = Object.fromEntries((profs ?? []).map((p) => [p.id, Number(p.default_daily_hours ?? 6)]))
          const attMap = Object.fromEntries(
            (attRows ?? []).map((a) => [`${a.member_id}::${a.work_date}`, Number(a.worked_hours ?? 0)])
          )

          const groups: Record<
            string,
            { memberId: string; month: string; leaveItems: PendingLeaveItem[] }
          > = {}
          for (const r of pendingLeaves) {
            const month = r.leave_date.slice(0, 7)
            const key = `${r.member_id}-${month}`
            groups[key] ??= { memberId: r.member_id, month, leaveItems: [] }
            const attKey = `${r.member_id}::${r.leave_date}`
            groups[key].leaveItems.push({
              id: r.id,
              leave_date: r.leave_date,
              leave_type_name: r.leave_types?.name ?? '未知假別',
              duration_type: r.duration_type,
              hours: r.hours,
              rawHours: attKey in attMap ? attMap[attKey] : null,
              defaultDailyHours: ddhMap[r.member_id] ?? 6,
            })
          }

          const now = Date.now()
          for (const g of Object.values(groups)) {
            const monthNum = Number(g.month.split('-')[1])
            const name = nameMap[g.memberId] ?? '未知成員'
            const id = `leave-pending-${g.memberId}-${g.month}`
            items.push({
              id,
              text: `你有[${g.leaveItems.length}]筆${name} - [${monthNum}月]待審核的請假，請至[請假系統]-該成員頁面進行審核`,
              colorClass: 'text-red-600 font-medium',
              sortKey: now,
            })
            boxes[id] = { type: 'leave', items: g.leaveItems }
          }
        }
      }

      // 4. owner-only: pending backfill (補登) punches awaiting approval, grouped by member + month,
      // with an inline approve/reject box rendered right under the notification line
      if (isOwner) {
        const { data: pendingBackfills } = await supabase
          .from('attendance_events')
          .select('id, member_id, occurred_at, event_type')
          .eq('is_backfill', true)
          .eq('approval_status', 'pending')

        if (pendingBackfills && pendingBackfills.length > 0) {
          const memberIds = Array.from(new Set(pendingBackfills.map((r) => r.member_id)))
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, preferred_display_name')
            .in('id', memberIds)
          const nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)]))

          const groups: Record<
            string,
            { memberId: string; month: string; backfillItems: PendingBackfillItem[] }
          > = {}
          for (const r of pendingBackfills) {
            const taipeiDate = new Date(new Date(r.occurred_at).getTime() + 8 * 3600 * 1000)
              .toISOString()
              .slice(0, 7)
            const key = `${r.member_id}-${taipeiDate}`
            groups[key] ??= { memberId: r.member_id, month: taipeiDate, backfillItems: [] }
            groups[key].backfillItems.push({
              id: r.id,
              occurred_at: r.occurred_at,
              event_type: r.event_type,
            })
          }

          const now = Date.now()
          for (const g of Object.values(groups)) {
            const monthNum = Number(g.month.split('-')[1])
            const name = nameMap[g.memberId] ?? '未知成員'
            const id = `backfill-pending-${g.memberId}-${g.month}`
            items.push({
              id,
              text: `你有[${g.backfillItems.length}]筆${name} - [${monthNum}月]待審核的補登打卡，請至[打卡系統]-該成員頁面進行審核`,
              colorClass: 'text-red-600 font-medium',
              sortKey: now,
            })
            boxes[id] = { type: 'backfill', items: g.backfillItems }
          }
        }
      }

      // 4b. owner-only: today's pending 額外出勤申請 (only ever today, per the
      // feature's own "only report today" rule) — must be caught same-day
      if (isOwner) {
        const { data: pendingOvertime } = await supabase
          .from('overtime_pre_reports')
          .select('id, member_id, requested_hours')
          .eq('status', 'pending')
          .eq('work_date', today)

        if (pendingOvertime && pendingOvertime.length > 0) {
          const memberIds = Array.from(new Set(pendingOvertime.map((r) => r.member_id)))
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name, preferred_display_name')
            .in('id', memberIds)
          const nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, effectiveDisplayName(p)]))

          const overtimeItems: PendingOvertimeItem[] = pendingOvertime.map((r) => ({
            id: r.id,
            member_name: nameMap[r.member_id] ?? '未知成員',
            requested_hours: r.requested_hours,
          }))

          const now = Date.now()
          const id = `overtime-pending-${today}`
          items.push({
            id,
            text: `你有[${overtimeItems.length}]筆今日待審核的額外出勤申請，請於今日內審核（逾期視為不核准）`,
            colorClass: 'text-red-600 font-medium',
            sortKey: now,
          })
          boxes[id] = { type: 'overtime', items: overtimeItems }
        }
      }

      // 5. owner-only: month-start reminder to produce last month's settlement snapshot
      // for members flagged 必須計算月結, persists until that snapshot exists
      if (isOwner && inMonthStartWindow) {
        const targetYearMonth = addMonths(currentYearMonth, -1)
        const { data: mustCalculate } = await supabase
          .from('profiles')
          .select('id, display_name, preferred_display_name')
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
              text: `已進入[${currentMonthNum}月]月初區間，您尚未產出[${effectiveDisplayName(m)}]的[${targetMonthNum}月]月結，請至[月結系統]產出月結！`,
              colorClass: 'text-red-600 font-medium',
              sortKey: now,
            })
          }
        }
      }

      // 6. owner-only: throughout January, remind about members missing this
      // year's new 約定月薪 (effective 該年 1/1) in 成員管理's [$] wage table
      if (isOwner && currentYearMonth.slice(5, 7) === '01') {
        const currentYear = currentYearMonth.slice(0, 4)
        const januaryFirst = `${currentYear}-01-01`
        const { data: withHireDate } = await supabase
          .from('profiles')
          .select('id, display_name, preferred_display_name')
          .not('hire_date', 'is', null)
          .lte('hire_date', januaryFirst)

        if (withHireDate && withHireDate.length > 0) {
          const { data: wageRows } = await supabase
            .from('member_wage_rates')
            .select('member_id')
            .eq('effective_date', januaryFirst)

          const doneIds = new Set((wageRows ?? []).map((w) => w.member_id))
          const missing = withHireDate.filter((m) => !doneIds.has(m.id))
          const now = Date.now()
          for (const m of missing) {
            items.push({
              id: `wage-${m.id}-${currentYear}`,
              text: `您尚未新增${effectiveDisplayName(m)} - ${currentYear}年的<新時薪>，請至<成員管理>該成員的[$]裡新增`,
              colorClass: 'text-red-600 font-medium',
              sortKey: now,
            })
          }
        }
      }

    items.sort((a, b) => b.sortKey - a.sortKey)
    setNotifications(items)
    setReviewBoxes(boxes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile?.id,
    isOwner,
    orgSettings?.remind_month_end_publish,
    currentYearMonth,
    inMonthEndWindow,
    inMonthStartWindow,
  ])

  useEffect(() => {
    build()
  }, [build])

  if (!profile || profile.role === 'guest') {
    return <GuestNotice />
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h1 className="text-xl font-semibold">
          歡迎回來，{effectiveDisplayName(profile)}（{ROLE_LABELS[profile.role]}）
        </h1>
        <div className="flex items-center gap-3">
          <Link to="/usage-guide" className="text-xs text-blue-700 underline whitespace-nowrap">
            本系統該怎麼用？
          </Link>
          <Link to="/notifications-help" className="text-xs text-blue-700 underline whitespace-nowrap">
            什麼時候通知？
          </Link>
        </div>
      </div>
      <p className="text-gray-600 mb-6">從上方導覽選擇要使用的功能。</p>

      <h2 className="font-medium mb-2">通知中心</h2>
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-400">目前沒有新通知</p>
      ) : (
        <ul className="space-y-1">
          {notifications.map((n) => {
            const box = reviewBoxes[n.id]
            return (
              <li key={n.id}>
                <p className={`text-sm ${n.colorClass}`}>{n.text}</p>
                {box?.type === 'backfill' && (
                  <PendingBackfillReviewBox items={box.items} onChanged={build} />
                )}
                {box?.type === 'leave' && <PendingLeaveReviewBox items={box.items} onChanged={build} />}
                {box?.type === 'overtime' && <PendingOvertimeReviewBox items={box.items} onChanged={build} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
