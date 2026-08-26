import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'

export function useScheduleConfirmation(publicationId: string | undefined) {
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!publicationId) {
      setConfirmed(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('schedule_confirmations')
      .select('id')
      .eq('publication_id', publicationId)
      .maybeSingle()
    setConfirmed(!!data)
    setLoading(false)
  }, [publicationId])

  useEffect(() => {
    load()
  }, [load])

  return { confirmed, loading, reload: load }
}
