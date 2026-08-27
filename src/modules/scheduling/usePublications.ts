import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { Enums, Tables } from '@/shared/types/database'

export type PublicationSnapshotEntry = { work_date: string; status: Enums<'shift_status'> }
export type Publication = Tables<'schedule_publications'> & { published_by_name?: string }

export function useSchedulePublications(memberId: string | undefined, yearMonth: string) {
  const [publications, setPublications] = useState<Publication[]>([])
  const [loading, setLoading] = useState(true)
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    if (!memberId) return
    const seq = ++loadSeq.current
    setLoading(true)
    const { data } = await supabase
      .from('schedule_publications')
      .select('*')
      .eq('member_id', memberId)
      .eq('year_month', `${yearMonth}-01`)
      .order('published_at', { ascending: false })

    const rows = data ?? []
    const publisherIds = Array.from(
      new Set(rows.map((r) => r.published_by).filter((id): id is string => !!id))
    )
    let names: Record<string, string> = {}
    if (publisherIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', publisherIds)
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]))
    }
    // a newer load may have started (and possibly already resolved) while this one
    // was in flight — discard this result so it can't clobber fresher state
    if (seq !== loadSeq.current) return
    setPublications(
      rows.map((r) => ({ ...r, published_by_name: r.published_by ? names[r.published_by] : undefined }))
    )
    setLoading(false)
  }, [memberId, yearMonth])

  useEffect(() => {
    load()
  }, [load])

  return { publications, loading, reload: load, setPublications }
}
