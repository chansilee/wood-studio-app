import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 環境變數，請確認 .env.local')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
