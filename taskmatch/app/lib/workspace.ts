import axios from 'axios'
import { supabase, API, authHeaders } from './supabase'
import type { Role } from './role'

// Workspaces: one per team or company. Everything you see belongs to the workspace you're in,
// and your role is your role there. The API checks membership on every request; the database
// rules do the same, so switching here only chooses which workspace to open.

export type Workspace = { id: string; name: string; role: Role }
export type WorkspaceState = { current: string | null; role: string; workspaces: Workspace[] }

const CACHE = 'tm_ws_cache'

export function cachedWorkspaces(): WorkspaceState | null {
  try { return JSON.parse(localStorage.getItem(CACHE) || 'null') } catch { return null }
}

export async function fetchWorkspaces(): Promise<WorkspaceState> {
  const res = await axios.get(`${API}/workspaces`, { headers: await authHeaders() })
  try { localStorage.setItem(CACHE, JSON.stringify(res.data)) } catch { /* private mode */ }
  return res.data
}

/** Reload the session so its app_metadata (current workspace, role) is fresh, then open the app. */
async function reopen(path = '/dashboard') {
  await supabase.auth.refreshSession()
  try { localStorage.removeItem(CACHE); localStorage.removeItem('tm_role_override') } catch { /* private mode */ }
  window.location.assign(path)
}

export async function switchWorkspace(id: string) {
  await axios.post(`${API}/workspaces/switch`, { workspace_id: id }, { headers: await authHeaders() })
  await reopen()
}

export async function createWorkspace(name: string) {
  await axios.post(`${API}/workspaces`, { name }, { headers: await authHeaders() })
  await reopen()
}

export async function joinWorkspace(code: string) {
  const res = await axios.post(`${API}/workspaces/join`, { code }, { headers: await authHeaders() })
  await reopen()
  return res.data
}

/** Leave the workspace you're in. You land in another of yours, or on setup if there are none. */
export async function leaveWorkspace(userId: string) {
  await axios.delete(`${API}/workspaces/members/${userId}`, { headers: await authHeaders() })
  await reopen()
}

/** Pulls an invite code out of whatever was pasted: a full link or just the code. */
export function inviteCodeFrom(text: string) {
  const t = text.trim()
  const m = t.match(/\/join\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : t
}

export const inviteLink = (code: string) =>
  `${typeof window === 'undefined' ? '' : window.location.origin}/join/${code}`
