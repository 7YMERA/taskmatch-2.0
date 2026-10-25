'use client'

/* Audit trail: who did what, when, with the before and after of every change.
   Entries can't be edited or deleted, and the "who" is stamped from the login by the database. */

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { effectiveRole, can, roleLabel } from '../lib/role'
import { StackedColumns } from '../components/charts'
import { buckets, DAY } from '../lib/analytics'
import { Card, EmptyState, Icon, PageHeader, Skeleton } from '../components/ui'

const PAGE = 300
const RANGES = [{ key: '7', label: '7 days', days: 7 }, { key: '30', label: '30 days', days: 30 }, { key: '90', label: '90 days', days: 90 }, { key: 'all', label: 'All', days: 0 }]
const CATEGORIES: Record<string, { label: string; color: string }> = {
  task: { label: 'Tasks', color: 'var(--tm-chart-1)' },
  assignment: { label: 'Assignments', color: 'var(--tm-chart-2)' },
  student: { label: 'People', color: 'var(--tm-chart-3)' },
  account: { label: 'Accounts & roles', color: 'var(--tm-chart-4)' },
  group: { label: 'Groups', color: 'var(--tm-chart-6)' },
  comment: { label: 'Comments', color: 'var(--tm-chart-6)' },
  ai: { label: 'AI suggestions', color: 'var(--tm-violet)' },
}
const categoryOf = (action: string) => {
  const c = (action || '').split('.')[0]
  return CATEGORIES[c] ? c : 'other'
}
const catInfo = (c: string) => CATEGORIES[c] || { label: 'Other', color: 'var(--tm-text-faint)' }
const humanAction = (a: string) => (a || '').split('.').pop()!.replace(/_/g, ' ')
const destructive = (a: string) => /deleted|removed|bulk_deleted/.test(a || '')

function Details({ d }: { d: any }) {
  if (!d || typeof d !== 'object') return <p className="text-xs text-faint">No extra details.</p>
  const hasChange = 'from' in d && 'to' in d
  const rest = Object.entries(d).filter(([k]) => !(hasChange && (k === 'from' || k === 'to')))
  return (
    <div className="flex flex-col gap-1.5">
      {hasChange && (
        <p className="text-xs flex flex-wrap items-center gap-2">
          {d.field && <span className="text-faint">{String(d.field).replace(/_/g, ' ')}:</span>}
          <span className="tm-chip !py-0 line-through" style={{ color: 'var(--tm-text-faint)' }}>{fmt(d.from)}</span>
          <Icon name="arrowRight" size={12} />
          <span className="tm-chip !py-0 text-fg">{fmt(d.to)}</span>
        </p>
      )}
      {rest.filter(([k]) => k !== 'field').map(([k, v]) => (
        <p key={k} className="text-xs grid grid-cols-[8rem_1fr] gap-2">
          <span className="text-faint">{k.replace(/_/g, ' ')}</span>
          <span className="text-muted break-all">{fmt(v)}</span>
        </p>
      ))}
    </div>
  )
}
function fmt(v: any): string {
  if (v == null || v === '') return 'none'
  if (Array.isArray(v)) return v.length ? v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ') : 'none'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function Audit() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [me, setMe] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [range, setRange] = useState('30')
  const [category, setCategory] = useState('all')
  const [actor, setActor] = useState('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setMe(session.user.email || '')
      setRole(effectiveRole(session))
    })
    const q = new URLSearchParams(window.location.search)
    if (RANGES.some(r => r.key === q.get('range'))) setRange(q.get('range')!)
    if (q.get('category')) setCategory(q.get('category')!)
    if (q.get('actor')) setActor(q.get('actor')!)
    if (q.get('q')) setQuery(q.get('q')!)
  }, [])

  useEffect(() => {
    const u = new URL(window.location.href)
    const set = (k: string, v: string, def: string) => { if (v && v !== def) u.searchParams.set(k, v); else u.searchParams.delete(k) }
    set('range', range, '30'); set('category', category, 'all'); set('actor', actor, 'all'); set('q', query.trim(), '')
    window.history.replaceState(null, '', u)
  }, [range, category, actor, query])

  useEffect(() => { load(true) }, [range])

  const load = async (reset: boolean) => {
    setLoading(true)
    const days = RANGES.find(r => r.key === range)!.days
    let req = supabase.from('activity_logs').select('*').order('created_at', { ascending: false })
    if (days) req = req.gte('created_at', new Date(Date.now() - days * DAY).toISOString())
    const from = reset ? 0 : rows.length
    const { data } = await req.range(from, from + PAGE - 1)
    const got = data || []
    setRows(reset ? got : [...rows, ...got])
    setMore(got.length === PAGE)
    setLoading(false)
  }

  const q = query.trim().toLowerCase()
  const shown = rows.filter(l =>
    (category === 'all' || categoryOf(l.action) === category) &&
    (actor === 'all' || (l.actor_email || 'system') === actor) &&
    (!q || [l.actor_email, l.action, l.summary, l.details && JSON.stringify(l.details)].some(v => (v || '').toString().toLowerCase().includes(q))))
  const actors = Array.from(new Set(rows.map(l => l.actor_email || 'system'))).sort()
  const cats = Array.from(new Set(rows.map(l => categoryOf(l.action))))

  const people = new Set(shown.map(l => l.actor_email).filter(Boolean)).size
  const roleChanges = shown.filter(l => l.action === 'account.role_changed').length
  const deletions = shown.filter(l => destructive(l.action)).length
  const days = RANGES.find(r => r.key === range)!.days
  const chart = buckets(days || 84).map(w => ({
    label: new Date(w.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    values: [shown.filter(l => { const t = Date.parse(l.created_at); return t >= w.from && t < w.to }).length],
  }))

  // Group the list by day.
  const byDay: { day: string; items: any[] }[] = []
  shown.forEach(l => {
    const day = new Date(l.created_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const last = byDay[byDay.length - 1]
    if (last && last.day === day) last.items.push(l); else byDay.push({ day, items: [l] })
  })

  const exportCsv = () => {
    const cell = (v: any) => `"${fmt(v).replace(/"/g, '""')}"`
    const lines = [['When', 'Who', 'Role', 'Action', 'Summary', 'Details'].join(',')]
      .concat(shown.map(l => [l.created_at, l.actor_email || 'system', roleLabel(l.actor_role), l.action, l.summary, l.details].map(cell).join(',')))
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = `taskmatch-audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Audit trail"
          sub="Every change, who made it and when. Entries can't be edited or deleted, and who did it comes from their login."
          actions={role && can(role, 'audit.view') ? <button className="tm-btn tm-btn-ghost" onClick={exportCsv} disabled={!shown.length}><Icon name="download" size={15} /> Export CSV</button> : undefined} />

        {role && !can(role, 'audit.view') ? (
          <Card className="max-w-lg">
            <EmptyState icon={<Icon name="lock" size={28} />} title="Admins and team leads only"
              hint={`The audit trail is visible to admins and team leads. You're signed in as ${me} (${roleLabel(role)}).`} />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="tm-seg" aria-label="Date range">
                {RANGES.map(r => <button key={r.key} aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>)}
              </div>
              <div className="relative flex-1 min-w-[14rem] max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" size={15} /></span>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people, actions, details…" aria-label="Search the audit trail" className="tm-input !pl-9" />
              </div>
              <select className="tm-select-sm" value={category} onChange={e => setCategory(e.target.value)} aria-label="What changed">
                <option value="all">Everything</option>
                {cats.map(c => <option key={c} value={c}>{catInfo(c).label}</option>)}
              </select>
              <select className="tm-select-sm" value={actor} onChange={e => setActor(e.target.value)} aria-label="Who">
                <option value="all">Anyone</option>
                {actors.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {[
                ['Events', shown.length, more ? 'more available below' : RANGES.find(r => r.key === range)!.key === 'all' ? 'all time' : `last ${RANGES.find(r => r.key === range)!.label}`],
                ['People active', people, 'made at least one change'],
                ['Role changes', roleChanges, roleChanges ? 'check these were expected' : 'none in this range'],
                ['Deletions', deletions, deletions ? 'tasks, people or assignments removed' : 'nothing deleted'],
              ].map(([label, value, sub]) => (
                <Card key={label as string} className="p-4">
                  <p className="text-[13px] font-medium text-muted">{label}</p>
                  <p className="text-2xl font-semibold tabular-nums text-fg mt-1">{loading && !rows.length ? '…' : value}</p>
                  <p className="text-[11px] text-faint mt-1">{sub}</p>
                </Card>
              ))}
            </div>

            <Card className="p-5 mb-6">
              <p className="text-sm font-medium text-fg">Activity over time</p>
              <p className="text-xs text-faint mb-3">Events per {days && days <= 7 ? 'day' : 'week'} matching the filters</p>
              <StackedColumns data={chart} series={[{ label: 'Events', color: 'var(--tm-chart-1)' }]} height={110} />
            </Card>

            {loading && !rows.length ? (
              <Card className="p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} style={{ height: 16 }} />)}</Card>
            ) : shown.length === 0 ? (
              <Card><EmptyState icon={<Icon name="history" size={28} />}
                title={rows.length ? 'Nothing matches these filters' : 'No activity in this range'}
                hint={rows.length ? 'Try a wider date range or clear the search.' : 'Changes across the workspace show up here as they happen.'} /></Card>
            ) : (
              <div className="flex flex-col gap-5">
                {byDay.map(g => (
                  <section key={g.day}>
                    <p className="text-xs font-medium text-muted mb-2">{g.day} <span className="text-faint font-normal">· {g.items.length}</span></p>
                    <div className="tm-card divide-y" style={{ borderColor: 'var(--tm-border)' }}>
                      {g.items.map(l => {
                        const c = categoryOf(l.action)
                        const isOpen = open === l.id
                        return (
                          <Fragment key={l.id}>
                            <button className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-[var(--tm-surface-1)]" style={{ borderColor: 'var(--tm-border)' }}
                              onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}>
                              <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: catInfo(c).color }} title={catInfo(c).label} />
                              <span className="flex-1 min-w-0">
                                <span className="block text-sm text-fg">{l.summary || humanAction(l.action)}</span>
                                <span className="block text-[11px] text-faint mt-0.5">
                                  <span className="text-muted">{l.actor_email || 'system'}</span>
                                  {l.actor_role && <> · {roleLabel(l.actor_role)}</>}
                                  {' · '}<span className="capitalize">{catInfo(c).label.toLowerCase()} · {humanAction(l.action)}</span>
                                </span>
                              </span>
                              {destructive(l.action) && <span className="text-[11px] inline-flex items-center gap-1 shrink-0" style={{ color: 'var(--tm-rose)' }}><Icon name="trash" size={11} /> Deleted</span>}
                              <span className="text-[11px] text-faint tabular-nums shrink-0" title={new Date(l.created_at).toLocaleString()}>
                                {new Date(l.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="shrink-0 text-faint transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}><Icon name="chevronDown" size={14} /></span>
                            </button>
                            {isOpen && (
                              <div className="px-4 pb-3 pl-9" style={{ borderColor: 'var(--tm-border)' }}>
                                <Details d={l.details} />
                                <p className="text-[11px] text-faint mt-2">{new Date(l.created_at).toLocaleString()} · <code>{l.action}</code>{l.entity_id ? ` · ${l.entity_type} ${l.entity_id}` : ''}</p>
                              </div>
                            )}
                          </Fragment>
                        )
                      })}
                    </div>
                  </section>
                ))}
                {more && <button className="tm-btn tm-btn-ghost self-center" onClick={() => load(false)} disabled={loading}>{loading ? 'Loading…' : 'Load older entries'}</button>}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
