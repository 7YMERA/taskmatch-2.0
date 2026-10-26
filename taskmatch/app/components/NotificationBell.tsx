'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import { API, authHeaders, supabase } from '../lib/supabase'
import { can, effectiveRole } from '../lib/role'
import { Icon, type IconName } from './ui'

type Note = {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

const POLL_MS = 60_000
const PANEL_W = 360

// What each kind of notification looks like: an icon on a soft tint of one accent colour.
const KIND: Record<string, { icon: IconName; color: string }> = {
  task_assigned:      { icon: 'user',  color: 'var(--tm-indigo)' },
  task_unassigned:    { icon: 'x',     color: 'var(--tm-text-faint)' },
  task_completed:     { icon: 'check', color: 'var(--tm-emerald)' },
  task_due_soon:      { icon: 'clock', color: 'var(--tm-amber)' },
  approval_requested: { icon: 'inbox', color: 'var(--tm-amber)' },
  approval_approved:  { icon: 'check', color: 'var(--tm-emerald)' },
  approval_rejected:  { icon: 'x',     color: 'var(--tm-rose)' },
}
const kindOf = (t: string) => KIND[t] || { icon: 'bell' as IconName, color: 'var(--tm-sky)' }

// Reads the user's notification preference (set on the Settings page). Polling can be turned
// off, or its cadence changed; defaults to on at 60s when nothing is stored.
function notifPref(): { enabled: boolean; intervalMs: number } {
  try {
    const raw = JSON.parse(localStorage.getItem('tm_notif_pref') || 'null')
    if (raw && typeof raw === 'object') {
      return { enabled: raw.enabled !== false, intervalMs: Math.max(15, Number(raw.intervalSec) || 60) * 1000 }
    }
  } catch { /* private mode */ }
  return { enabled: true, intervalMs: POLL_MS }
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

export default function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<Note[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [leader, setLeader] = useState(false)
  const [pos, setPos] = useState<React.CSSProperties>({})
  const btn = useRef<HTMLButtonElement>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res = await axios.get(`${API}/notifications`, { headers: await authHeaders() })
      setItems(res.data.notifications || [])
      setUnread(res.data.unread || 0)
    } catch { /* offline / not logged in — stay quiet */ }
  }

  useEffect(() => {
    const pref = notifPref()
    load()
    supabase.auth.getSession().then(({ data: { session } }) => setLeader(can(effectiveRole(session), 'assign.others')))
    if (pref.enabled) {
      timer.current = setInterval(load, pref.intervalMs)
    }
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // The panel is fixed to the viewport and placed next to the bell, so it is never clipped by the
  // narrow sidebar or pushed off the bottom of the screen. It opens upward from a low bell.
  function toggle() {
    if (open) { setOpen(false); return }
    const r = btn.current?.getBoundingClientRect()
    if (r) {
      const vw = window.innerWidth, vh = window.innerHeight
      const width = Math.min(PANEL_W, vw - 24)
      const left = Math.min(Math.max(12, r.left), vw - width - 12)
      setPos(r.top > vh / 2
        ? { left, width, bottom: vh - r.top + 8, maxHeight: Math.min(520, r.top - 24) }
        : { left, width, top: r.bottom + 8, maxHeight: Math.min(520, vh - r.bottom - 24) })
    }
    setOpen(true)
    load()
  }

  async function markAllRead() {
    setUnread(0)
    setItems(xs => xs.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() })))
    try { await axios.post(`${API}/notifications/read`, {}, { headers: await authHeaders() }) } catch { /* retried next poll */ }
  }

  async function openItem(n: Note) {
    setOpen(false)
    if (!n.read_at) {
      setUnread(u => Math.max(0, u - 1))
      setItems(xs => xs.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      try { await axios.post(`${API}/notifications/read`, { notification_id: n.id }, { headers: await authHeaders() }) } catch { /* */ }
    }
    if (n.link) router.push(n.link)
  }

  const shown = tab === 'unread' ? items.filter(n => !n.read_at) : items
  const sections = [
    { name: 'Today', rows: shown.filter(n => isToday(n.created_at)) },
    { name: 'Earlier', rows: shown.filter(n => !isToday(n.created_at)) },
  ].filter(s => s.rows.length)

  return (
    <>
      <button ref={btn} onClick={toggle} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications"
        className="tm-btn tm-btn-quiet tm-btn-icon relative"
        style={open ? { background: 'var(--tm-surface-2)', color: 'var(--tm-text)' } : undefined}>
        <Icon name="bell" size={16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center tabular-nums"
            style={{ background: 'var(--tm-rose)', color: '#fff', boxShadow: '0 0 0 2px var(--tm-bg-sidebar)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Notifications"
            className="fixed z-[61] flex flex-col rounded-xl border border-line overflow-hidden"
            style={{ ...pos, background: 'var(--tm-bg-elev)', boxShadow: '0 16px 40px -12px rgb(0 0 0 / 0.35)' }}>
            <div className="px-4 pt-3.5 pb-2.5 shrink-0" style={{ borderBottom: '1px solid var(--tm-border)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-fg">Notifications</span>
                {unread > 0 && (
                  <span className="text-[11px] font-medium px-1.5 py-px rounded-full"
                    style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>{unread} new</span>
                )}
                {unread > 0 && (
                  <button onClick={markAllRead} className="ml-auto text-[12px] text-muted hover:text-fg flex items-center gap-1">
                    <Icon name="check" size={13} /> Mark all read
                  </button>
                )}
              </div>
              <div className="flex gap-1 mt-2.5" role="tablist">
                {(['all', 'unread'] as const).map(t => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                    className="text-[12px] px-2.5 py-1 rounded-md transition-colors"
                    style={tab === t
                      ? { background: 'var(--tm-surface-2)', color: 'var(--tm-text)', fontWeight: 500 }
                      : { color: 'var(--tm-text-muted)' }}>
                    {t === 'all' ? 'All' : `Unread${unread ? ` (${unread})` : ''}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0">
              {sections.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <span className="inline-flex w-11 h-11 rounded-full items-center justify-center"
                    style={{ background: 'var(--tm-surface-2)', color: 'var(--tm-text-faint)' }}>
                    <Icon name="bell" size={20} />
                  </span>
                  <p className="text-[13px] font-medium text-fg mt-3">{tab === 'unread' ? 'No unread notifications' : "You're all caught up"}</p>
                  <p className="text-[12px] text-faint mt-1">Assignments, approvals and finished tasks show up here.</p>
                </div>
              ) : sections.map(s => (
                <div key={s.name}>
                  <p className="px-4 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{s.name}</p>
                  {s.rows.map(n => {
                    const k = kindOf(n.type)
                    return (
                      <button key={n.id} onClick={() => openItem(n)}
                        className="w-full text-left px-4 py-2.5 flex gap-3 items-start transition-colors hover:bg-surface-2"
                        style={{ background: n.read_at ? undefined : 'color-mix(in srgb, var(--tm-primary) 6%, transparent)' }}>
                        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: `color-mix(in srgb, ${k.color} 15%, transparent)`, color: k.color }}>
                          <Icon name={k.icon} size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13px] leading-snug text-fg ${n.read_at ? '' : 'font-medium'}`}
                            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {n.title}
                          </span>
                          {n.body && <span className="block text-[12px] text-muted truncate mt-0.5">{n.body}</span>}
                          <span className="block text-[11px] text-faint mt-1">{timeAgo(n.created_at)}</span>
                        </span>
                        {!n.read_at && <span className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--tm-primary)' }} aria-label="Unread" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 px-4 py-2.5 text-[12px] shrink-0" style={{ borderTop: '1px solid var(--tm-border)' }}>
              {leader && (
                <Link href="/approvals" onClick={() => setOpen(false)} className="flex items-center gap-1.5 text-primary-text hover:underline">
                  <Icon name="inbox" size={13} /> Open approvals
                </Link>
              )}
              <Link href="/settings" onClick={() => setOpen(false)} className="ml-auto text-muted hover:text-fg">
                Notification settings
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  )
}
