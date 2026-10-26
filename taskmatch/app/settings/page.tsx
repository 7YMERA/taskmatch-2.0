'use client'

/* Settings: app-wide preferences for the signed-in user. Everything here is real —
   theme flips the tokens, the notification controls drive the bell's polling, and the
   workspace section reflects the open workspace. Skills and away status live on /profile. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { applyTheme, getStoredTheme } from '../lib/theme'
import { roleLabel } from '../lib/role'
import { cachedWorkspaces, fetchWorkspaces, type WorkspaceState } from '../lib/workspace'
import { Card, PageHeader, Icon } from '../components/ui'
import { toast } from '../lib/ui'

type Theme = 'dark' | 'light'
const NOTIF_KEY = 'tm_notif_pref'

function getNotif(): { enabled: boolean; intervalSec: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIF_KEY) || 'null')
    if (raw && typeof raw === 'object') return { enabled: raw.enabled !== false, intervalSec: Number(raw.intervalSec) || 60 }
  } catch { /* private mode */ }
  return { enabled: true, intervalSec: 60 }
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 mb-4">
      <p className="text-sm font-semibold text-fg">{title}</p>
      {sub && <p className="text-[12px] text-faint mt-0.5 mb-3">{sub}</p>}
      <div className={sub ? '' : 'mt-3'}>{children}</div>
    </Card>
  )
}

export default function Settings() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [theme, setTheme] = useState<Theme>('dark')
  const [notif, setNotif] = useState(getNotif())
  const [ws, setWs] = useState<WorkspaceState | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setEmail(session.user.email || '')
    })
    setTheme(getStoredTheme())
    const cached = cachedWorkspaces(); if (cached) setWs(cached)
    fetchWorkspaces().then(setWs).catch(() => {})
  }, [])

  const pickTheme = (t: Theme) => { setTheme(t); applyTheme(t) }

  const saveNotif = (next: { enabled: boolean; intervalSec: number }) => {
    setNotif(next)
    try { localStorage.setItem(NOTIF_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    toast('Notification preference saved. It takes effect on the next page load.', 'success')
  }

  const currentWs = ws?.workspaces.find(w => w.id === ws.current)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Settings" sub={`Preferences for ${email || 'your account'}.`} />

        <div className="max-w-2xl">
          <Section title="Appearance" sub="Choose how TaskMatch looks. The whole app flips at once.">
            <div className="flex gap-2">
              {([['dark', 'moon', 'Dark'], ['light', 'sun', 'Light']] as const).map(([val, icon, label]) => (
                <button key={val} onClick={() => pickTheme(val)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg border text-[13px] transition-colors"
                  style={{
                    borderColor: theme === val ? 'var(--tm-primary)' : 'var(--tm-border)',
                    background: theme === val ? 'var(--tm-primary-soft)' : 'transparent',
                    color: theme === val ? 'var(--tm-primary-text)' : 'var(--tm-text-muted)',
                  }}>
                  <Icon name={icon} size={15} /> {label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Notifications" sub="The bell checks for new notifications on a timer. Turn it off or change how often.">
            <label className="flex items-center justify-between gap-4 py-1">
              <span className="text-[13px] text-fg">Check for new notifications</span>
              <button role="switch" aria-checked={notif.enabled}
                onClick={() => saveNotif({ ...notif, enabled: !notif.enabled })}
                className="relative w-10 h-6 rounded-full transition-colors shrink-0"
                style={{ background: notif.enabled ? 'var(--tm-primary)' : 'var(--tm-surface-2)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: notif.enabled ? '18px' : '2px' }} />
              </button>
            </label>
            <div className="flex items-center justify-between gap-4 py-2 mt-1" style={{ opacity: notif.enabled ? 1 : 0.5 }}>
              <span className="text-[13px] text-fg">How often</span>
              <select className="tm-select-sm" disabled={!notif.enabled} value={notif.intervalSec}
                onChange={e => saveNotif({ ...notif, intervalSec: Number(e.target.value) })}>
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every minute</option>
                <option value={300}>Every 5 minutes</option>
              </select>
            </div>
          </Section>

          <Section title="Workspace" sub="The team or company you're working in.">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-fg truncate">{currentWs?.name || '—'}</p>
                <p className="text-[12px] text-faint">{currentWs ? `You are ${roleLabel(currentWs.role)} here` : 'No workspace'}</p>
              </div>
              <Link href="/team" className="tm-btn tm-btn-ghost shrink-0"><Icon name="shield" size={15} /> Members &amp; roles</Link>
            </div>
          </Section>

          <Section title="Your profile" sub="Skills, avatar and away status are on your profile.">
            <Link href="/profile" className="tm-btn tm-btn-ghost"><Icon name="user" size={15} /> Open my profile</Link>
          </Section>
        </div>
      </main>
    </div>
  )
}
