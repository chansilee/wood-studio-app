import { supabase } from '@/shared/lib/supabase'
import { effectiveDisplayName } from '@/shared/lib/displayName'

// how long since the lock holder's last activity before we treat a
// still-open 盤點修正 session as abandoned and let others through
export const INVENTORY_LOCK_EXPIRY_MINUTES = 15

export interface InventoryLockState {
  lockedBy: string | null
  lockedAt: string | null
  lockedByName: string | null
  draft: Record<string, number>
  reason: string
  isExpired: boolean
}

function lockExpired(lockedAt: string | null): boolean {
  if (!lockedAt) return true
  return Date.now() - new Date(lockedAt).getTime() > INVENTORY_LOCK_EXPIRY_MINUTES * 60 * 1000
}

export async function fetchInventoryLock(): Promise<InventoryLockState> {
  const { data } = await supabase.from('inventory_count_lock').select('*').eq('id', 1).single()
  const empty: InventoryLockState = { lockedBy: null, lockedAt: null, lockedByName: null, draft: {}, reason: '', isExpired: true }
  if (!data || !data.locked_by) return empty

  const expired = lockExpired(data.locked_at)
  let lockedByName: string | null = null
  if (!expired) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name, preferred_display_name')
      .eq('id', data.locked_by)
      .maybeSingle()
    lockedByName = prof ? effectiveDisplayName(prof) : null
  }
  return {
    lockedBy: data.locked_by,
    lockedAt: data.locked_at,
    lockedByName,
    draft: (data.draft as Record<string, number>) ?? {},
    reason: data.reason ?? '',
    isExpired: expired,
  }
}

/** Returns a friendly blocking message if someone ELSE currently holds a non-expired lock, otherwise null. */
export async function checkInventoryLockBlock(myMemberId: string): Promise<string | null> {
  const lock = await fetchInventoryLock()
  if (lock.lockedBy && lock.lockedBy !== myMemberId && !lock.isExpired) {
    return `${lock.lockedByName ?? '負責人'}正在進行盤點修正，請稍晚再同步一次`
  }
  return null
}

export async function acquireInventoryLock(memberId: string): Promise<void> {
  await supabase
    .from('inventory_count_lock')
    .update({ locked_by: memberId, locked_at: new Date().toISOString(), draft: {}, reason: '' })
    .eq('id', 1)
}

/** Refreshes locked_at (extends the idle-expiry window) without touching draft/reason. */
export async function touchInventoryLock(): Promise<void> {
  await supabase.from('inventory_count_lock').update({ locked_at: new Date().toISOString() }).eq('id', 1)
}

export async function saveInventoryDraft(draft: Record<string, number>, reason: string): Promise<void> {
  await supabase.from('inventory_count_lock').update({ draft, reason, locked_at: new Date().toISOString() }).eq('id', 1)
}

export async function releaseInventoryLock(): Promise<void> {
  await supabase.from('inventory_count_lock').update({ locked_by: null, locked_at: null, draft: {}, reason: '' }).eq('id', 1)
}
