'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase, API } from '../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import { effectiveRole, realRole, setRoleOverride, getRoleOverride, can, roleLabel, ROLES, type Role } from '../lib/role'
import { ThemeToggle } from '../lib/theme'
import { Icon, Logo, type IconName } from './ui'
import { cachedWorkspaces, fetchWorkspaces, switchWorkspace, type WorkspaceState } from '../lib/workspace'

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [real, setReal] = useState<Role>('member')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [open, setOpen] = useState(false)   // mobile drawer
  const [ws, setWs] = useState<WorkspaceState | null>(null)
  const [wsMenu, setWsMenu] = useState(false)
  const [switching, setSwitching] = useState(false)

  useEffect(() => { axios.get(`${API}/health`, { timeout: 60000 }).catch(() => {}) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const e = session.user.email || ''
      setEmail(e)
      setRole(effectiveRole(session))
      setReal(realRole(session))
      const { data } = await supabase.from('students').select('name, avatar_url').eq('email', e).maybeSingle()
      if (data) { setName(data.name || ''); setAvatar(data.avatar_url || null) }
    })
  }, [])

  // Which workspace we're in. A new account with no workspace is sent to set one up.
  useEffect(() => {
    const cached = cachedWorkspaces()
    if (cached) Promise.resolve().then(() => setWs(w => w ?? cached))   // last known, until the fresh list arrives
    fetchWorkspaces()
      .then(w => { setWs(w); if (!w.workspaces.length) router.replace('/onboarding') })
      .catch(e => { if (e?.response?.status === 409) router.replace('/onboarding') })
  }, [])
  const currentWs = ws?.workspaces.find(w => w.id === ws.current)

  // Close the drawer on route change (mobile).
  useEffect(() => { setOpen(false) }, [pathname])

  const initials = (n: string) => (n || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()

  const nav = [
    { label: 'Dashboard', href: '/dashboard', icon: 'grid' as const },
    { label: 'People', href: '/students', icon: 'users' as const },
    { label: 'Projects', href: '/projects', icon: 'folder' as const },
    { label: 'Tasks', href: '/tasks', icon: 'check' as const },
    { label: 'My Tasks', href: '/my-tasks', icon: 'star' as const },
  ]
  const adminNav = [
    ...(can(role, 'team.manage') ? [{ label: 'Members & roles', href: '/team', icon: 'shield' as const }] : []),
    ...(can(role, 'audit.view') ? [{ label: 'Audit trail', href: '/audit', icon: 'history' as const }] : []),
  ]
  const previewing = real === 'admin' && !!getRoleOverride() && role !== real

  const navLink = (item: { label: string; href: string; icon: IconName }) => {
        const activeItem = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors hover:bg-surface-2"
            style={{
              color: activeItem ? 'var(--tm-text)' : 'var(--tm-text-muted)',
              background: activeItem ? 'var(--tm-surface-2)' : undefined,
              fontWeight: activeItem ? 500 : 400,
            }}>
            <span className="shrink-0" style={{ color: activeItem ? 'var(--tm-primary-text)' : 'var(--tm-text-faint)' }}>
              <Icon name={item.icon} size={16} />
            </span>
            {item.label}
          </Link>
        )
        }

  const panel = (
    <aside className="w-60 px-3 py-4 flex flex-col gap-0.5 shrink-0 h-screen overflow-y-auto"
      style={{ background: 'var(--tm-bg-sidebar)', borderRight: '1px solid var(--tm-border)' }}>
      <Link href="/dashboard" className="flex items-center px-2 pb-4 pt-1">
        <Logo size={26} />
      </Link>

      {/* Workspace switcher */}
      <div className="relative mb-3">
        <button onClick={() => setWsMenu(v => !v)} aria-expanded={wsMenu} aria-haspopup="menu"
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg border border-line transition-colors hover:bg-surface-2 text-left">
          <span className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>
            {(currentWs?.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-fg truncate">{currentWs?.name || (ws ? 'No workspace' : '…')}</span>
            <span className="block text-[11px] text-faint truncate">{currentWs ? roleLabel(currentWs.role) : 'Workspace'}</span>
          </span>
          <span className="text-faint shrink-0"><Icon name="chevrons" size={14} /></span>
        </button>
        {wsMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setWsMenu(false)} />
            <div role="menu" className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border border-line p-1 shadow-lg"
              style={{ background: 'var(--tm-bg-elev)' }}>
              <p className="px-2 pt-1.5 pb-1 text-[11px] text-faint">Your workspaces</p>
              {(ws?.workspaces || []).map(w => (
                <button key={w.id} role="menuitem" disabled={switching}
                  onClick={async () => { if (w.id === ws?.current) { setWsMenu(false); return } setSwitching(true); try { await switchWorkspace(w.id) } catch { setSwitching(false) } }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[13px] hover:bg-surface-2 disabled:opacity-60">
                  <span className="min-w-0 flex-1 truncate text-fg">{w.name}</span>
                  <span className="text-[11px] text-faint shrink-0">{roleLabel(w.role)}</span>
                  <span className="w-3.5 shrink-0 text-primary-text">{w.id === ws?.current && <Icon name="check" size={14} />}</span>
                </button>
              ))}
              <div className="my-1" style={{ borderTop: '1px solid var(--tm-border)' }} />
              <Link href="/onboarding?mode=create" role="menuitem" className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-muted hover:bg-surface-2">
                <Icon name="plus" size={14} /> Create a workspace
              </Link>
              <Link href="/onboarding?mode=join" role="menuitem" className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] text-muted hover:bg-surface-2">
                <Icon name="link" size={14} /> Join with an invite
              </Link>
            </div>
          </>
        )}
      </div>

      {nav.map(navLink)}
      {adminNav.length > 0 && <p className="px-2 pt-4 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">Admin</p>}
      {adminNav.map(navLink)}

      <div className="mt-auto pt-3 flex flex-col gap-2">
        {real === 'admin' && (
          <div className="rounded-lg p-2.5 border border-line bg-subtle">
            <label htmlFor="tm-preview" className="text-[11px] mb-1.5 text-faint block">Preview the app as</label>
            <select id="tm-preview" className="tm-select-sm w-full" value={role}
              onChange={e => { setRoleOverride(e.target.value === 'admin' ? null : e.target.value as Role); window.location.reload() }}>
              {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}{r.key === 'admin' ? ' (you)' : ''}</option>)}
            </select>
            {previewing && <p className="text-[10px] mt-1.5 text-faint">Only changes what you see. Your real access is unchanged.</p>}
          </div>
        )}

        <div className="flex items-center gap-1 pt-2" style={{ borderTop: '1px solid var(--tm-border)' }}>
          <Link href="/profile" className="flex flex-1 min-w-0 items-center gap-2.5 px-1.5 py-1.5 rounded-md transition-colors hover:bg-surface-2">
            {avatar
              ? <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              : <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>{initials(name || email)}</div>}
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate text-fg">{name || 'My profile'}</p>
              <p className="text-[11px] truncate text-faint">{roleLabel(role)}{previewing ? ' (preview)' : ''}</p>
            </div>
          </Link>
          <ThemeToggle />
          <button onClick={async () => { setRoleOverride(null); await supabase.auth.signOut(); router.push('/login') }}
            aria-label="Sign out" title="Sign out" className="tm-btn tm-btn-quiet tm-btn-icon">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 h-14"
        style={{ background: 'var(--tm-bg-sidebar)', borderBottom: '1px solid var(--tm-border)' }}>
        <button onClick={() => setOpen(true)} aria-label="Open menu" style={{ color: 'var(--tm-text)' }}><Icon name="menu" /></button>
        <Logo size={24} />
        <div className="ml-auto"><ThemeToggle /></div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block sticky top-0 self-start">{panel}</div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} />
          <div className="absolute left-0 top-0" onClick={e => e.stopPropagation()}>{panel}</div>
        </div>
      )}
    </>
  )
}
