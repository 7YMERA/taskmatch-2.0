import { supabase, API } from './supabase'

// Sign in as the shared demo visitor (a team lead in the demo workspace). The API does the
// sign-in on the server and hands back the session, so no demo password is ever in the page.
export async function startDemo() {
  const res = await fetch(`${API}/demo/start`, { method: 'POST' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || "Couldn't open the demo. Try again in a moment.")
  const { error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
  if (error) throw new Error(error.message)
}
