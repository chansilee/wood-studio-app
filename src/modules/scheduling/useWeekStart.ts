import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { weekdayFromDateStr } from '@/shared/lib/date'

/**
 * Resolves the effective week-start weekday (0=Sun..6=Sat) for a member+month:
 * an explicit per-month override if one exists, otherwise the weekday of the
 * member's hire date, otherwise Sunday.
 */
export function useWeekStart(
  memberId: string | undefined,
  yearMonth: string,
  hireDate: string | null | undefined
) {
  const [weekStartWeekday, setWeekStartWeekday] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    const { data } = await supabase
      .from('member_week_start_overrides')
      .select('week_start_weekday')
      .eq('member_id', memberId)
      .eq('year_month', `${yearMonth}-01`)
      .maybeSingle()

    setWeekStartWeekday(data ? data.week_start_weekday : hireDate ? weekdayFromDateStr(hireDate) : 0)
    setLoading(false)
  }, [memberId, yearMonth, hireDate])

  useEffect(() => {
    load()
  }, [load])

  const shiftWeekStart = async (delta: 1 | -1, updatedBy: string | undefined) => {
    if (!memberId) return
    const next = (weekStartWeekday + delta + 7) % 7
    setWeekStartWeekday(next)
    await supabase.from('member_week_start_overrides').upsert(
      {
        member_id: memberId,
        year_month: `${yearMonth}-01`,
        week_start_weekday: next,
        updated_by: updatedBy,
      },
      { onConflict: 'member_id,year_month' }
    )
  }

  return { weekStartWeekday, loading, shiftWeekStart, reload: load }
}
