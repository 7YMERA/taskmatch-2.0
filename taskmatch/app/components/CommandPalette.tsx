'use client'

/* Command palette (Ctrl/⌘ + K). A single overlay to jump anywhere or run a quick action.
   Searches tasks, people and projects in the current workspace (RLS scopes the reads), plus
   role-gated navigation actions. Keyboard-first: ↑/↓ to move, Enter to go, Esc to close. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { can, type Role } from '../lib/role'
import { Icon, type IconName } from './ui'
import { toCsv, downloadCsv, stamp } from '../lib/csv'

type Item = {
  id: string
  label: string
  sub?: string
  group: 'Actions' | 'Export' | 'Tasks' | 'People' | 'Projects'
  icon: IconName
  href?: string
  run?: () => void | Promise<void>
}

export default function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [role, setRole] = useState<Role>('member')
  const [data, setData] = useState<{ tasks: Item[]; people: Item[]; projects: Item[] }>({ tasks: [], people: [], projects: [] })
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Open on Ctrl/⌘+K from anywhere; close on Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Load the searchable set once, the first time the palette opens.
  const loadData = useCallback(async () => {
    if (loaded) return
    try {
      const { data: s } = await supabase.auth.getSession()
      setRole((s.session?.user?.app_metadata?.role as Role) || 'member')
      const [tasks, people, projects] = await Promise.all([
        supabase.from('tasks').select('id, description, status').limit(500),
        supabase.from('students').select('id, name, programme').limit(500),
        supabase.from('projects').select('id, name, key').limit(200),
      ])
      setData({
        tasks: (tasks.data || []).map(t => ({ id: t.id, label: t.description || 'Untitled task', sub: t.status, group: 'Tasks', icon: 'check', href: `/tasks/${t.id}` })),
        people: (people.data || []).map(p => ({ id: p.id, label: p.name || 'Unnamed', sub: p.programme || undefined, group: 'People', icon: 'user', href: `/students/${p.id}` })),
        projects: (projects.data || []).map(p => ({ id: p.id, label: p.name, sub: p.key || undefined, group: 'Projects', icon: 'folder', href: `/projects` })),
      })
      setLoaded(true)
    } catch { /* stay quiet — user may be offline */ }
  }, [loaded])

  useEffect(() => {
    if (open) {
      loadData()
      setQ(''); setActive(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open, loadData])

  // Role-gated quick actions (navigation + launchers + exports).
  const actions: Item[] = useMemo(() => {
    const a: Item[] = [
      { id: 'a-dash', label: 'Go to Dashboard', group: 'Actions', icon: 'grid', href: '/dashboard' },
      { id: 'a-tasks', label: 'Go to Tasks', group: 'Actions', icon: 'check', href: '/tasks' },
      { id: 'a-people', label: 'Go to People', group: 'Actions', icon: 'users', href: '/students' },
      { id: 'a-projects', label: 'Go to Projects', group: 'Actions', icon: 'folder', href: '/projects' },
      { id: 'a-mytasks', label: 'Go to My Tasks', group: 'Actions', icon: 'star', href: '/my-tasks' },
      { id: 'a-settings', label: 'Go to Settings', group: 'Actions', icon: 'edit', href: '/settings' },
      { id: 'a-newtask', label: 'New task', sub: 'Create a task', group: 'Actions', icon: 'plus', href: '/tasks?new=1' },
    ]
    if (can(role, 'assign.others')) a.push({ id: 'a-approvals', label: 'Go to Approvals', group: 'Actions', icon: 'inbox', href: '/approvals' })
    if (can(role, 'audit.view')) a.push({ id: 'a-audit', label: 'Go to Audit trail', group: 'Actions', icon: 'history', href: '/audit' })
    if (can(role, 'team.manage')) a.push({ id: 'a-team', label: 'Go to Members & roles', group: 'Actions', icon: 'shield', href: '/team' })

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

  // Filter: actions always show (filtered by query); data groups only once there's a query.
  const results: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const match = (it: Item) => !needle || it.label.toLowerCase().includes(needle) || (it.sub || '').toLowerCase().includes(needle)
    const acts = actions.filter(match)
    if (!needle) return acts
    return [...acts, ...data.tasks.filter(match).slice(0, 8), ...data.people.filter(match).slice(0, 8), ...data.projects.filter(match).slice(0, 8)]
  }, [q, actions, data])

  useEffect(() => { setActive(0) }, [q])

  const go = useCallback((it: Item) => {
    setOpen(false)
    if (it.run) { void it.run() }
    else if (it.href) { router.push(it.href) }
  }, [router])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) go(results[active]) }
  }

  if (!open) return null

  // Group the flat result list for display, preserving order.
  const groups: { name: string; items: { it: Item; idx: number }[] }[] = []
  results.forEach((it, idx) => {
    const last = groups[groups.length - 1]
    if (last && last.name === it.group) last.items.push({ it, idx })
    else groups.push({ name: it.group, items: [{ it, idx }] })
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
      style={{ background: 'color-mix(in srgb, #000 55%, transparent)', backdropFilter: 'blur(3px)' }}>
      <div className="w-full max-w-xl rounded-2xl border border-line overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--tm-bg-elev)' }}>
        <div className="flex items-center gap-2.5 px-4" style={{ borderBottom: '1px solid var(--tm-border)' }}>
          <span className="text-faint shrink-0"><Icon name="search" size={18} /></span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search tasks, people, projects — or jump to a page…"
            className="flex-1 bg-transparent py-3.5 text-[14px] text-fg outline-none placeholder:text-faint"
            aria-label="Command palette search" />
          <kbd className="text-[10px] text-faint px-1.5 py-0.5 rounded border border-line shrink-0">Esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-faint">
              {loaded ? 'No matches.' : 'Loading…'}
            </p>
          ) : (
            groups.map(g => (
              <div key={g.name} className="px-1.5">
                <p className="px-2.5 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{g.name}</p>
                {g.items.map(({ it, idx }) => (
                  <button key={it.id} onMouseEnter={() => setActive(idx)} onClick={() => go(it)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left"
                    style={{ background: idx === active ? 'var(--tm-surface-2)' : undefined }}>
                    <span className="shrink-0" style={{ color: idx === active ? 'var(--tm-primary-text)' : 'var(--tm-text-faint)' }}>
                      <Icon name={it.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-fg truncate">{it.label}</span>
                      {it.sub && <span className="block text-[11px] text-faint truncate">{it.sub}</span>}
                    </span>
                    {idx === active && <span className="text-faint shrink-0"><Icon name="arrowRight" size={14} /></span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 text-[10.5px] text-faint" style={{ borderTop: '1px solid var(--tm-border)' }}>
          <span><kbd className="px-1 rounded border border-line">↑</kbd> <kbd className="px-1 rounded border border-line">↓</kbd> move</span>
          <span><kbd className="px-1 rounded border border-line">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="px-1 rounded border border-line">⌘</kbd><kbd className="px-1 rounded border border-line">K</kbd> toggle</span>
        </div>
      </div>
    </div>
  )
}
