import { supabase } from '@/shared/lib/supabase'
import { addDays, addMonths, countCarryInStreak } from '@/shared/lib/date'
import type { PublicationSnapshotEntry } from './usePublications'

const LOOKBACK_DAYS = 40

async function fetchDraftCarryIn(
  memberId: string,
  monthStart: string,
  lookbackStart: string,
  hireDate?: string | null
): Promise<number> {
  const { data } = await supabase
    .from('schedules')
    .select('work_date, status')
    .eq('member_id', memberId)
    .gte('work_date', lookbackStart)
    .lt('work_date', monthStart)

  const map: Record<string, string> = {}
  for (const r of data ?? []) map[r.work_date] = r.status
  return countCarryInStreak(monthStart, map, hireDate)
}

async function fetchPublishedCarryIn(
  memberId: string,
  yearMonth: string,
  lookbackStart: string,
  hireDate?: string | null
): Promise<number> {
  const monthStart = `${yearMonth}-01`
  const prevYearMonth = addMonths(yearMonth, -1)

  const months: string[] = []
  let cursor = lookbackStart.slice(0, 7)
  while (cursor <= prevYearMonth) {
    months.push(cursor)
    cursor = addMonths(cursor, 1)
  }

  const map: Record<string, string> = {}
  for (const ym of months) {
    const { data } = await supabase
      .from('schedule_publications')
      .select('snapshot')
      .eq('member_id', memberId)
      .eq('year_month', `${ym}-01`)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const entries = (data?.snapshot as PublicationSnapshotEntry[] | null) ?? []
    for (const e of entries) {
      if (e.work_date >= lookbackStart && e.work_date < monthStart) map[e.work_date] = e.status
    }
  }
  return countCarryInStreak(monthStart, map, hireDate)
}

/**
 * Consecutive normal-shift days immediately preceding the 1st of `yearMonth`,
 * bounded below by the member's hire date (or a 40-day cap when there is none).
 * `source: 'draft'` reads the live schedules table (排班模式); `'published'`
 * reads the latest schedule_publications snapshot per prior month (瀏覽模式).
 */
export async function fetchCarryInStreak(opts: {
  memberId: string
  yearMonth: string
  hireDate?: string | null
  source: 'draft' | 'published'
}): Promise<number> {
  const monthStart = `${opts.yearMonth}-01`
  const capStart = addDays(monthStart, -LOOKBACK_DAYS)
  const lookbackStart = opts.hireDate && opts.hireDate > capStart ? opts.hireDate : capStart

  if (lookbackStart >= monthStart) return 0

  return opts.source === 'draft'
    ? fetchDraftCarryIn(opts.memberId, monthStart, lookbackStart, opts.hireDate)
    : fetchPublishedCarryIn(opts.memberId, opts.yearMonth, lookbackStart, opts.hireDate)
}
