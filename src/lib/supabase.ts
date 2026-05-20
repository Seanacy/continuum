import { createClient } from '@supabase/supabase-js'

// Supabase client for server-side storage operations
// Project: frregeepcpxsujosyckw (Continuum)
// Uses service role key if available, falls back to anon key
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY — storage uploads will fail')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
})
