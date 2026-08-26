import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useScheduleConfirmation(publicationId: string | undefined) {
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!publicationId) {
      setConfirmedAt(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('schedule_confirmations')
      .select('confirmed_at')
      .eq('publication_id', publicationId)
      .maybeSingle()
    setConfirmedAt(data?.confirmed_at ?? null)
    setLoading(false)
  }, [publicationId])

  useEffect(() => {
    load()
  }, [load])

  return { confirmed: !!confirmedAt, confirmedAt, loading, reload: load }
}
