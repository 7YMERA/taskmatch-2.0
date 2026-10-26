'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { API, authHeaders } from '../lib/supabase'
import { Icon } from './ui'

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

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<Note[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res = await axios.get(`${API}/notifications`, { headers: await authHeaders() })
      setItems(res.data.notifications || [])
      setUnread(res.data.unread || 0)
    } catch { /* offline / not logged in — stay quiet */ }
  }

  useEffect(() => {
    load()
    timer.current = setInterval(load, POLL_MS)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [])

  async function markAllRead() {
    setUnread(0)
    setItems(xs => xs.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() })))
    try { await axios.post(`${API}/notifications/read`, {}, { headers: await authHeaders() }) } catch { /* retried next poll */ }
  }

  async function openItem(n: Note) {
    setOpen(false)
    if (!n.read_at) {
      setUnread(u => Math.max(0, u - 1))
      try { await axios.post(`${API}/notifications/read`, { notification_id: n.id }, { headers: await authHeaders() }) } catch { /* */ }
    }
    if (n.link) router.push(n.link)
  }

  return (
    <div className="relative">
      <button onClick={() => { setOpen(v => !v); if (!open) load() }}
        aria-label="Notifications" title="Notifications"
        className="tm-btn tm-btn-quiet tm-btn-icon relative">
        <Icon name="bell" size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
            style={{ background: 'var(--tm-rose)', color: '#fff' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu"
            className="absolute right-0 top-full mt-2 z-40 w-80 max-h-96 overflow-y-auto rounded-xl border border-line shadow-lg"
            style={{ background: 'var(--tm-bg-elev)' }}>
            <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: '1px solid var(--tm-border)' }}>
              <span className="text-[13px] font-semibold text-fg">Notifications</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-primary-text hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <span className="text-faint"><Icon name="bell" size={22} /></span>
                <p className="text-[12px] text-faint mt-1.5">You&apos;re all caught up.</p>
              </div>
            ) : (
              items.map(n => (
                <button key={n.id} onClick={() => openItem(n)}
                  className="w-full text-left px-3 py-2.5 flex gap-2.5 hover:bg-surface-2 transition-colors"
                  style={{ borderBottom: '1px solid var(--tm-border)' }}>
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: n.read_at ? 'transparent' : 'var(--tm-primary)' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium text-fg truncate">{n.title}</span>
                    {n.body && <span className="block text-[11.5px] text-muted truncate">{n.body}</span>}
                    <span className="block text-[10.5px] text-faint mt-0.5">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
