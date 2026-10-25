import { createClient } from '@supabase/supabase-js'

// The one browser Supabase client for the whole app. Every page and helper imports
// this instead of calling createClient itself, so there's a single auth session
// (no "multiple GoTrueClient instances" warning) and one place to change config.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Base URL of the FastAPI backend (taskmatch-api).
export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Bearer header for the API. Every endpoint except /health requires a logged-in user,
// so send this on reads as well as writes.
export async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : {}
}
