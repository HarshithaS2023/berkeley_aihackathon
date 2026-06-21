import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}

const url = env.VITE_SUPABASE_URL?.trim()
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!)
  : null
