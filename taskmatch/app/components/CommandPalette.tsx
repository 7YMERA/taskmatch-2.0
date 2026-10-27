'use client'

/* Command palette (Ctrl/⌘ + K). A single overlay to jump anywhere or run a quick action.
   Searches tasks, people and projects in the current workspace (RLS scopes the reads), plus
   role-gated navigation actions. Keyboard-first: ↑/↓ to move, Enter to go, Esc to close.
   Anything can open it by dispatching OPEN_PALETTE on window (the sidebar's Search button does). */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { can, effectiveRole, type Role } from '../lib/role'
import { Icon, type IconName } from './ui'
import { toCsv, downloadCsv, stamp } from '../lib/csv'

export const OPEN_PALETTE = 'tm:open-palette'

/** "⌘" on a Mac, "Ctrl" everywhere else. Starts as "Ctrl" so server and first client render agree. */
export function useModKey() {
  const [mod, setMod] = useState('Ctrl')
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) Promise.resolve().then(() => setMod('⌘'))
  }, [])
  return mod
}

type Group = 'Go to' | 'Create' | 'Export' | 'Tasks' | 'People' | 'Projects'
type Item = {
  id: string
  label: string
  sub?: string
  group: Group
  icon: IconName
  color?: string       // icon tint
  badge?: { text: string; color: string }
  href?: string
  run?: () => void | Promise<void>
}

const STATUS_COLOR: Record<string, string> = {
  'New': 'var(--tm-sky)', 'In Progress': 'var(--tm-amber)', 'Completed': 'var(--tm-emerald)',
  'Delayed': 'var(--tm-rose)', 'Closed': 'var(--tm-text-faint)',
}
const GROUP_ORDER: Group[] = ['Go to', 'Create', 'Tasks', 'People', 'Projects', 'Export']

// Higher is better: whole label starts with it, then a word in it does, then anywhere; 0 = no match.
function score(it: Item, needle: string): number {
  const label = it.label.toLowerCase()
  if (label.startsWith(needle)) return 3
  if (label.split(/\s+/).some(w => w.startsWith(needle))) return 2
  if (label.includes(needle) || (it.sub || '').toLowerCase().includes(needle)) return 1
  return 0
}

/** The label with the matched part in bold. */
function Highlight({ text, needle }: { text: string; needle: string }) {
  const i = needle ? text.toLowerCase().indexOf(needle) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark className="bg-transparent font-semibold" style={{ color: 'var(--tm-primary-text)' }}>{text.slice(i, i + needle.length)}</mark>{text.slice(i + needle.length)}</>
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-line text-[10px] font-sans"
    style={{ background: 'var(--tm-surface-2)' }}>{children}</kbd>
}

export default function CommandPalette() {
  const router = useRouter()
  const mod = useModKey()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [role, setRole] = useState<Role>('member')
  const [data, setData] = useState<{ tasks: Item[]; people: Item[]; projects: Item[] }>({ tasks: [], people: [], projects: [] })
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Open on Ctrl/⌘+K from anywhere, or when something dispatches OPEN_PALETTE.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE, onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_PALETTE, onOpen) }
  }, [])

  // Refresh the searchable set every time the palette opens, so new tasks and people show up.
  // The previous set stays on screen while the fresh one loads.
  const loadData = useCallback(async () => {
    try {
      const { data: s } = await supabase.auth.getSession()
      setRole(effectiveRole(s.session))
      const [tasks, people, projects] = await Promise.all([
        supabase.from('tasks').select('id, description, status').limit(500),
        supabase.from('students').select('id, name, programme').limit(500),
        supabase.from('projects').select('id, name, key').limit(200),
      ])
      setData({
        tasks: (tasks.data || []).map(t => ({ id: t.id, label: t.description || 'Untitled task', group: 'Tasks', icon: 'check', color: STATUS_COLOR[t.status],
          badge: t.status ? { text: t.status, color: STATUS_COLOR[t.status] || 'var(--tm-text-faint)' } : undefined, href: `/tasks/${t.id}` })),
        people: (people.data || []).map(p => ({ id: p.id, label: p.name || 'Unnamed', sub: p.programme || undefined, group: 'People', icon: 'user', color: 'var(--tm-violet)', href: `/people/${p.id}` })),
        projects: (projects.data || []).map(p => ({ id: p.id, label: p.name, group: 'Projects', icon: 'folder', color: 'var(--tm-sky)',
          badge: p.key ? { text: p.key, color: 'var(--tm-sky)' } : undefined, href: `/projects` })),
      })
    } catch { /* stay quiet — user may be offline */ }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!open) return
    Promise.resolve().then(() => { setQ(''); setActive(0) })
    loadData()
    const t = setTimeout(() => inputRef.current?.focus(), 20)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [open, loadData])

  // Role-gated quick actions (navigation + launchers + exports).
  const actions: Item[] = useMemo(() => {
    const go = (id: string, label: string, icon: IconName, href: string): Item => ({ id, label, group: 'Go to', icon, href })
    const a: Item[] = [
      go('a-dash', 'Dashboard', 'grid', '/dashboard'),
      go('a-mytasks', 'My Tasks', 'star', '/my-tasks'),
      go('a-tasks', 'Tasks', 'check', '/tasks'),
      go('a-people', 'People', 'users', '/people'),
      go('a-match', 'Find a match', 'target', '/match'),
      go('a-projects', 'Projects', 'folder', '/projects'),
      go('a-settings', 'Settings', 'edit', '/settings'),
    ]
    if (can(role, 'assign.others')) a.push(go('a-approvals', 'Approvals', 'inbox', '/approvals'))
    if (can(role, 'tasks.manage')) a.push(go('a-integrations', 'Integrations', 'link', '/integrations'))
    if (can(role, 'audit.view')) a.push(go('a-audit', 'Audit trail', 'history', '/audit'))
    if (can(role, 'team.manage')) a.push(go('a-team', 'Members & roles', 'shield', '/team'))
    if (can(role, 'tasks.manage')) a.push({ id: 'a-newtask', label: 'New task', sub: 'Opens the create panel on Tasks', group: 'Create', icon: 'plus', color: 'var(--tm-emerald)', href: '/tasks?new=1' })

    // Exports — anyone who can see the data can download it as CSV.
    a.push({
      id: 'x-tasks', label: 'Export tasks as CSV', group: 'Export', icon: 'download',
      run: async () => {
        const { data } = await supabase.from('tasks').select('id, description, status, severity, committed_hours, due_date, completed_at').limit(5000)
        downloadCsv(toCsv(data || [], [
          { key: 'id', label: 'ID' }, { key: 'description', label: 'Description' }, { key: 'status', label: 'Status' },
          { key: 'severity', label: 'Severity' }, { key: 'committed_hours', label: 'Committed hours' },
          { key: 'due_date', label: 'Due date' }, { key: 'completed_at', label: 'Completed at' },
        ]), `taskmatch-tasks-${stamp()}.csv`)
      },
    })
    a.push({
      id: 'x-people', label: 'Export people as CSV', group: 'Export', icon: 'download',
      run: async () => {
        const { data } = await supabase.from('students').select('id, name, matric, programme, email, group_label, away_until').limit(5000)
        downloadCsv(toCsv(data || [], [
          { key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'matric', label: 'Matric' },
          { key: 'programme', label: 'Programme' }, { key: 'email', label: 'Email' },
          { key: 'group_label', label: 'Group' }, { key: 'away_until', label: 'Away until' },
        ]), `taskmatch-people-${stamp()}.csv`)
      },
    })
    return a
  }, [role])

  // With no query: the actions. With a query: best matches first within each group, a few per group.
  const needle = q.trim().toLowerCase()
  const results: Item[] = useMemo(() => {
    if (!needle) return actions
    const ranked = (xs: Item[], n: number) => xs.map(it => ({ it, s: score(it, needle) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s).slice(0, n).map(x => x.it)
    const pool = [...ranked(actions, 6), ...ranked(data.tasks, 6), ...ranked(data.people, 5), ...ranked(data.projects, 4)]
    return GROUP_ORDER.flatMap(g => pool.filter(it => it.group === g))
  }, [needle, actions, data])

  useEffect(() => { Promise.resolve().then(() => setActive(0)) }, [q])

  // Keep the highlighted row in view while moving with the arrow keys.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = useCallback((it: Item) => {
    setOpen(false)
    if (it.run) { void it.run() }
    else if (it.href) { router.push(it.href) }
  }, [router])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % Math.max(1, results.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + results.length) % Math.max(1, results.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) go(results[active]) }
  }

  if (!open) return null

  // Group the ordered result list for display.
  const groups: { name: string; items: { it: Item; idx: number }[] }[] = []
  results.forEach((it, idx) => {
    const last = groups[groups.length - 1]
    if (last && last.name === it.group) last.items.push({ it, idx })
    else groups.push({ name: it.group, items: [{ it, idx }] })
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
      style={{ background: 'color-mix(in srgb, #000 45%, transparent)' }}>
      <div role="dialog" aria-label="Search and commands"
        className="w-full max-w-[600px] rounded-2xl border border-line overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--tm-bg-elev)', boxShadow: '0 24px 60px -16px rgb(0 0 0 / 0.45)', maxHeight: '72vh' }}>
        <div className="flex items-center gap-3 px-4 shrink-0" style={{ borderBottom: '1px solid var(--tm-border)' }}>
          <span className="text-faint shrink-0"><Icon name="search" size={18} /></span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search tasks, people and projects, or jump to a page"
            className="flex-1 bg-transparent py-4 text-[15px] text-fg placeholder:text-faint"
            style={{ outline: 'none', boxShadow: 'none', border: 0 }}
            role="combobox" aria-expanded="true" aria-controls="tm-palette-list"
            aria-activedescendant={results[active] ? `tm-pal-${active}` : undefined}
            aria-label="Search" />
          {q
            ? <button onClick={() => { setQ(''); inputRef.current?.focus() }} className="text-[11px] text-faint hover:text-fg shrink-0">Clear</button>
            : <Kbd>Esc</Kbd>}
        </div>

        <div ref={listRef} id="tm-palette-list" role="listbox" className="overflow-y-auto py-2 flex-1 min-h-0">
          {results.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-[13px] font-medium text-fg">{loaded ? `No results for “${q.trim()}”` : 'Loading…'}</p>
              {loaded && <p className="text-[12px] text-faint mt-1">Try a task name, a person, or a page like “tasks”.</p>}
            </div>
          ) : (
            groups.map(g => (
              <div key={g.name} className="px-2 pb-1">
                <p className="px-2.5 pt-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{g.name}</p>
                {g.items.map(({ it, idx }) => {
                  const on = idx === active
                  return (
                    <button key={it.id} id={`tm-pal-${idx}`} data-idx={idx} role="option" aria-selected={on}
                      onMouseMove={() => { if (!on) setActive(idx) }} onClick={() => go(it)}
                      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left"
                      style={{ background: on ? 'var(--tm-surface-2)' : undefined }}>
                      <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: `color-mix(in srgb, ${it.color || 'var(--tm-text-faint)'} 14%, transparent)`, color: it.color || 'var(--tm-text-muted)' }}>
                        <Icon name={it.icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] text-fg truncate"><Highlight text={it.label} needle={needle} /></span>
                        {it.sub && <span className="block text-[11.5px] text-faint truncate">{it.sub}</span>}
                      </span>
                      {it.badge && (
                        <span className="text-[11px] px-1.5 py-px rounded-md shrink-0"
                          style={{ color: it.badge.color, background: `color-mix(in srgb, ${it.badge.color} 13%, transparent)` }}>
                          {it.badge.text}
                        </span>
                      )}
                      <span className="w-4 shrink-0 text-faint" style={{ opacity: on ? 1 : 0 }}><Icon name="arrowRight" size={14} /></span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 text-[11px] text-faint shrink-0" style={{ borderTop: '1px solid var(--tm-border)', background: 'var(--tm-bg-sidebar)' }}>
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> to open</span>
          <span className="ml-auto flex items-center gap-1"><Kbd>{mod}</Kbd><Kbd>K</Kbd> to open or close</span>
        </div>
      </div>
    </div>
  )
}
