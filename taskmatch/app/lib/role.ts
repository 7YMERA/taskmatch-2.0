import PERMS from './permissions.json'

// Roles and permissions. The same table lives in taskmatch-api/main.py (ROLE_PERMISSIONS) and
// in supabase/roles.sql (tm_can); a backend test checks the API copy against permissions.json.
//
// A role belongs to a workspace: you can be an admin in one and a member in another. The source
// of truth is workspace_members, checked by the API and the database rules on every request.
// The server copies your role in the open workspace into app_metadata (which only it can write),
// and the app reads it from there for display. user_metadata is NOT used: a signed-in user can
// edit their own user_metadata.

export type Role = 'admin' | 'lead' | 'member' | 'viewer'
export type Permission =
  | 'tasks.manage' | 'people.manage' | 'assign.others' | 'insights.view' | 'audit.view'
  | 'team.manage' | 'work.self' | 'comment' | 'away.self'

export const ROLES = PERMS.roles as { key: Role; label: string; description: string }[]
export const PERMISSIONS = PERMS.permissions as { key: Permission; label: string; roles: Role[] }[]
const isRole = (r: unknown): r is Role => ROLES.some(x => x.key === r)

const LEGACY: Record<string, string> = { leader: 'Leader', student: 'Student' }   // roles from before Phase 2, still in old log rows
export const roleLabel = (r?: string | null) => ROLES.find(x => x.key === r)?.label || (r && LEGACY[r]) || 'Member'

export function can(role: string | null | undefined, perm: Permission): boolean {
  return !!role && !!PERMISSIONS.find(p => p.key === perm)?.roles.includes(role as Role)
}

/** Your real role in the open workspace, from app_metadata. */
export function realRole(session: any): Role {
  const r = session?.user?.app_metadata?.role
  return isRole(r) ? r : 'member'
}

// "Preview as": admins can see the UI as another role to check what that role sees. It only
// changes the UI; the API and database rules still use the real role, so it grants nothing.
const KEY = 'tm_role_override'

export function getRoleOverride(): Role | null {
  if (typeof window === 'undefined') return null
  try {
    const r = localStorage.getItem(KEY)
    return isRole(r) ? r : null
  } catch { return null }
}

export function setRoleOverride(role: Role | null) {
  try {
    if (role) localStorage.setItem(KEY, role)
    else localStorage.removeItem(KEY)
  } catch { /* private mode */ }
}

/** Role the UI uses: an admin's preview choice, otherwise the real role. */
export function effectiveRole(session: any): Role {
  const real = realRole(session)
  return real === 'admin' ? getRoleOverride() || real : real
}
