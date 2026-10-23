'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'
import Link from 'next/link'
import { effectiveRole, setRoleOverride } from '../lib/role'
import { ThemeToggle } from '../lib/theme'
import { Icon } from './ui'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [open, setOpen] = useState(false)   // mobile drawer

  useEffect(() => { axios.get(`${API}/health`, { timeout: 60000 }).catch(() => {}) }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const e = session.user.email || ''
      setEmail(e)
      setRole(effectiveRole(session))
      const { data } = await supabase.from('students').select('name, avatar_url').eq('email', e).maybeSingle()
      if (data) { setName(data.name || ''); setAvatar(data.avatar_url || null) }
    })
  }, [])

  // Close the drawer on route change (mobile).
  useEffect(() => { setOpen(false) }, [pathname])

  const initials = (n: string) => (n || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()

  const nav = [
    { label: 'Dashboard', href: '/dashboard', icon: 'grid' as const },
    { label: 'Students', href: '/students', icon: 'users' as const },
    { label: 'Tasks', href: '/tasks', icon: 'check' as const },
    { label: 'My Tasks', href: '/my-tasks', icon: 'star' as const },
    ...(role === 'leader' ? [{ label: 'Logs', href: '/logs', icon: 'list' as const }] : []),
  ]

  const panel = (
    <aside className="w-56 p-4 flex flex-col gap-1 shrink-0 h-screen overflow-y-auto"
      style={{ background: 'var(--tm-bg-sidebar)', borderRight: '1px solid var(--tm-border)' }}>
      <div className="flex flex-col items-center gap-2 py-3 mb-3" style={{ borderBottom: '1px solid var(--tm-border)' }}>
        <svg width="44" height="44" viewBox="0 0 42 42" fill="none" aria-label="TaskMatch logo"
          className="drop-shadow-[0_2px_10px_rgba(99,102,241,0.4)]">
          <defs>
            <linearGradient id="tmLogo" x1="4" y1="4" x2="38" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366f1" /><stop offset="0.5" stopColor="#8b5cf6" /><stop offset="1" stopColor="#34d399" />
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="36" height="36" rx="11" fill="url(#tmLogo)" />
          <line x1="15.5" y1="15.5" x2="26.5" y2="26.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.9" />
          <circle cx="15" cy="15" r="3.6" fill="#fff" /><rect x="22.5" y="22.5" width="7" height="7" rx="2.2" fill="#fff" />
        </svg>
        <span className="text-lg tracking-tight tm-wordmark">TaskMatch</span>
      </div>

      {nav.map(item => {
        const activeItem = pathname === item.href
        return (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition"
            style={{
              color: activeItem ? 'var(--tm-text)' : 'var(--tm-text-muted)',
              background: activeItem ? 'var(--tm-surface-2)' : 'transparent',
              borderLeft: activeItem ? '2px solid var(--tm-indigo)' : '2px solid transparent',
            }}>
            <span className="shrink-0 opacity-70" style={{ width: 16 }}><Icon name={item.icon} size={16} /></span>{item.label}
          </Link>
        )
      })}

      <div className="mt-auto pt-4" style={{ borderTop: '1px solid var(--tm-border)' }}>
        <Link href="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg transition hover:bg-white/5">
          {avatar
            ? <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>{initials(name || email)}</div>}
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--tm-text)' }}>My Profile</p>
            <p className="text-[11px] truncate" style={{ color: 'var(--tm-text-faint)' }}>{email}</p>
          </div>
        </Link>
        <div className="px-3 mt-1 flex items-center justify-between">
          <span className="px-2 py-0.5 rounded-full text-xs"
            style={role === 'leader'
              ? { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }
              : { background: 'rgba(52,211,153,0.2)', color: '#34d399' }}>
            {role || 'student'}
          </span>
          <ThemeToggle />
        </div>

        <div className="px-3 mt-2">
          <p className="text-[10px] mb-1" style={{ color: 'var(--tm-text-faint)' }}>Testing — view as</p>
          <div className="flex gap-1">
            {['leader', 'student'].map(r => (
              <button key={r} onClick={() => { setRoleOverride(r); window.location.reload() }}
                className="flex-1 text-[11px] py-1 rounded border capitalize transition"
                style={role === r
                  ? { borderColor: 'var(--tm-indigo)', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }
                  : { borderColor: 'var(--tm-border)', color: 'var(--tm-text-faint)' }}>{r}</button>
            ))}
          </div>
        </div>

        <button onClick={async () => { setRoleOverride(null); await supabase.auth.signOut(); router.push('/login') }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition mt-2 hover:bg-red-500/10"
          style={{ color: 'rgba(248,113,113,0.7)' }}>
          Sign out
        </button>
      </div>
    </aside>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 h-14"
        style={{ background: 'var(--tm-bg-sidebar)', borderBottom: '1px solid var(--tm-border)' }}>
        <button onClick={() => setOpen(true)} aria-label="Open menu" style={{ color: 'var(--tm-text)' }}><Icon name="menu" /></button>
        <span className="tm-wordmark font-bold">TaskMatch</span>
        <div className="ml-auto"><ThemeToggle /></div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block sticky top-0 self-start">{panel}</div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} />
          <div className="absolute left-0 top-0" onClick={e => e.stopPropagation()}>{panel}</div>
        </div>
      )}
    </>
  )
}
