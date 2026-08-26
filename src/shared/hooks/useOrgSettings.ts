import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/shared/lib/supabase'
import type { Tables } from '@/shared/types/database'

type OrgSettings = Tables<'org_settings'>

export function useOrgSettings() {
  const [settings, setSettings] = useState<OrgSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('org_settings').select('*').eq('id', 1).single()
    setSettings(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { settings, loading, reload: load }
}
