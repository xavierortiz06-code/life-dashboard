import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured =
  !!supabaseUrl && !!supabaseKey && !supabaseUrl.includes('your_supabase')

if (!isConfigured) {
  console.error(
    'Supabase is not configured yet.\n' +
    'Open .env.local and replace the placeholder values with your real keys from supabase.com.'
  )
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : createClient('https://placeholder.supabase.co', 'placeholder')
