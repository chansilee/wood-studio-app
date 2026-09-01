import { supabase } from '@/shared/lib/supabase'

export const MONTH_SETTLED_MESSAGE = '本月已產生月結報表，不能再進行異動'

/**
 * 'YYYY-MM' -> is there a settlement_snapshots row for this member+month (DB
 * triggers enforce this too; this is for proactive UI disabling). Goes
 * through the `is_month_settled` RPC rather than querying
 * settlement_snapshots directly — that table's RLS is owner-only, but the
 * RPC is a security-definer function that just returns the boolean, so a
 * member checking their own month (e.g. before submitting a leave request
 * or attendance backfill) gets a real answer instead of always-false.
 */
export async function isMonthSettled(memberId: string, yearMonth: string): Promise<boolean> {
  if (!memberId || !yearMonth) return false
  const { data } = await supabase.rpc('is_month_settled', { p_member_id: memberId, p_date: `${yearMonth}-01` })
  return !!data
}

/** 'YYYY-MM-DD' -> 'YYYY-MM', for checking a single date against isMonthSettled. */
export function yearMonthOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}
