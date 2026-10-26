'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, API, authHeaders } from '../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import { toast } from '../lib/ui'
import { effectiveRole, can } from '../lib/role'
import { buckets, DAY } from '../lib/analytics'
import { StackedColumns, Legend } from '../components/charts'
import { severityDot } from '../components/TaskViews'
import { Card, Badge, Button, Icon, Skeleton, EmptyState, PageHeader } from '../components/ui'

/* My Tasks: a personal focus page. What's running, what's next, how my weeks are going,
   and what I could pick up — without visiting four pages. */

const WIP_LIMIT = 3
const todayKey = () => new Date().toISOString().slice(0, 10)
const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const hoursSince = (iso: string | null | undefined, now: number) => iso ? Math.max(0, (now - new Date(iso).getTime()) / 3600000) : 0
const clock = (iso: string | null | undefined, now: number) => {
  const t = Math.floor(hoursSince(iso, now) * 3600)
  if (t >= 86400) return fmtHours(t / 3600)   // a day or more: seconds stop meaning anything
  return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n, i) => i ? String(n).padStart(2, '0') : String(n)).join(':')
}
const fmtHours = (h: number) => h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}m` : `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`

/** Due date as a countdown, coloured only when it needs attention. */
function DueChip({ due, done = false }: { due?: string | null; done?: boolean }) {
  if (!due) return <span className="text-[11px] text-faint">No due date</span>
  const days = Math.round((Date.parse(due) - Date.parse(todayKey())) / DAY)
  const [text, color] = done ? [`Due ${fmtDay(due)}`, 'var(--tm-text-faint)']
    : days < 0 ? [`${-days}d overdue`, 'var(--tm-rose)']
    : days === 0 ? ['Due today', 'var(--tm-amber)']
    : days <= 3 ? [`Due in ${days}d`, 'var(--tm-amber)']
    : [`Due ${fmtDay(due)}`, 'var(--tm-text-faint)']
  return <span className="text-[11px] tabular-nums inline-flex items-center gap-1" style={{ color }}><Icon name="clock" size={11} /> {text}</span>
}

/** Completing a task: hours with one-tap fills from the timer or the budget. */
function CompleteDialog({ a, now, onClose, onDone }: { a: any; now: number; onClose: () => void; onDone: (hours?: number) => Promise<void> }) {
  const timer = Math.round(hoursSince(a.in_progress_at, now) * 10) / 10
  const budget = a.tasks?.committed_hours
  const [hours, setHours] = useState('')
  const [saving, setSaving] = useState(false)
  const n = hours.trim() === '' ? undefined : parseFloat(hours)
  const invalid = n !== undefined && (isNaN(n) || n < 0)
  const submit = async () => { if (invalid) return; setSaving(true); await onDone(n); setSaving(false) }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="complete-title" onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--tm-bg-elev)', boxShadow: 'var(--tm-shadow)' }}>
        <p id="complete-title" className="text-base font-semibold text-fg">Mark as complete</p>
        <p className="text-sm text-muted mt-1">{a.tasks?.description}</p>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="rounded-lg p-3" style={{ background: 'var(--tm-surface-2)' }}>
            <p className="text-[11px] text-faint">Timer</p>
            <p className="text-lg font-semibold tabular-nums text-fg">{fmtHours(timer)}</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--tm-surface-2)' }}>
            <p className="text-[11px] text-faint">Budget</p>
            <p className="text-lg font-semibold tabular-nums text-fg">{budget != null ? `${budget}h` : '—'}</p>
          </div>
        </div>
        <form onSubmit={e => { e.preventDefault(); submit() }} className="mt-4">
          <label htmlFor="hours" className="tm-label">Hours you actually spent</label>
          <input id="hours" className="tm-input" inputMode="decimal" autoFocus value={hours} onChange={e => setHours(e.target.value)}
            placeholder={`Leave blank to use the timer (${timer}h)`} />
          <div className="flex flex-wrap gap-2 mt-2">
            <button type="button" className="tm-chip" onClick={() => setHours(String(timer))}>Use timer · {timer}h</button>
            {budget != null && <button type="button" className="tm-chip" onClick={() => setHours(String(budget))}>Same as budget · {budget}h</button>}
          </div>
          {invalid && <p className="text-xs mt-2" style={{ color: 'var(--tm-rose)' }}>Enter a number of hours, like 4.5.</p>}
          <p className="text-xs text-faint mt-3">Count the time you really worked on it. Breaks and nights off don&apos;t count, which is why this can differ from the timer.</p>
          <div className="flex justify-end gap-2 mt-5">
            <button type="button" onClick={onClose} className="tm-btn tm-btn-ghost tm-btn-sm">Cancel</button>
            <button type="submit" disabled={saving || invalid} className="tm-btn tm-btn-primary tm-btn-sm">
              <Icon name="check" size={13} /> {saving ? 'Saving…' : 'Mark complete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MyTasks() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('')
  const [student, setStudent] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const [completing, setCompleting] = useState<any>(null)
  const [doneRange, setDoneRange] = useState<'30' | 'all'>('30')
  const [teamTasks, setTeamTasks] = useState<any[]>([])
  const [suggested, setSuggested] = useState<any[]>([])
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => { init() }, [])
  // Live clock for the running timers.
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const errMsg = (err: any, fallback: string) => {
    const detail = err?.response?.data?.detail
    if (detail) return detail
    if (err?.response) return `${fallback} (server responded ${err.response.status})`
    return `${fallback} — couldn't reach the server. It may be waking up (free tier); try again in a moment.`
  }

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserEmail(session.user.email || '')
    setUserRole(effectiveRole(session))
    const { data: s } = await supabase.from('students').select('*').eq('email', session.user.email).maybeSingle()
    if (!s) { setNotFound(true); setLoading(false); return }
    setStudent(s)
    await Promise.all([load(s.id), loadTeam(s.group_label, s.id), loadSuggested(s.id)])
    setLoading(false)
  }

  // Teammates' active tasks + due dates, so a student can schedule around the group.
  const loadTeam = async (grp: string | null, selfId: string) => {
    if (!grp) { setTeamTasks([]); return }
    const { data: mates } = await supabase.from('students').select('id, name').eq('group_label', grp).neq('id', selfId)
    const ids = (mates || []).map(m => m.id)
    if (ids.length === 0) { setTeamTasks([]); return }
    const nameById: { [id: string]: string } = {}
    ;(mates || []).forEach(m => { nameById[m.id] = m.name })
    const { data } = await supabase
      .from('assignments')
      .select('student_id, status, tasks(id, description, due_date)')
      .in('student_id', ids)
      .in('status', ['Assigned', 'In Progress'])
    const rows = (data || [])
      .filter((a: any) => a.tasks)
      .map((a: any) => ({ name: nameById[a.student_id], id: a.tasks.id, description: a.tasks.description, due_date: a.tasks.due_date, status: a.status }))
      .sort((x: any, y: any) => (x.due_date || '9999-12-31').localeCompare(y.due_date || '9999-12-31'))
    setTeamTasks(rows)
  }

  const loadSuggested = async (sid: string) => {
    try {
      const res = await axios.get(`${API}/recommend-tasks/${sid}`, { headers: await authHeaders() })
      setSuggested([...(res.data.qualified || []), ...(res.data.growth || [])].slice(0, 3))
    } catch { setSuggested([]) }
  }

  const load = async (sid: string) => {
    const { data } = await supabase
      .from('assignments')
      .select('*, tasks(id, description, status, severity, due_date, committed_hours, group_label)')
      .eq('student_id', sid)
      .order('assigned_date', { ascending: false })
    setAssignments(data || [])
  }

  const startTask = async (assignmentId: string) => {
    setBusy(assignmentId)
    try {
      await axios.post(`${API}/start`, { assignment_id: assignmentId }, { headers: await authHeaders() })
      if (student) await load(student.id)
      toast('Started. The timer is running.', 'success')
    } catch (err: any) { toast(errMsg(err, 'Could not start'), 'error') }
    finally { setBusy(null) }
  }

  const completeTask = async (a: any, actual_hours?: number) => {
    try {
      const res = await axios.post(`${API}/complete`, { assignment_id: a.id, actual_hours }, { headers: await authHeaders() })
      const d = res.data
      const basis = d.score != null && d.committed_hours != null ? ` — score ${d.score} (${d.committed_hours}h committed vs ${d.elapsed_hours}h actual)` : (d.score != null ? ` — score ${d.score}` : '')
      toast(`Completed!${can(userRole, 'insights.view') ? basis : ''}`, 'success')
      setCompleting(null)
      if (student) await Promise.all([load(student.id), loadSuggested(student.id)])
    } catch (err: any) { toast(errMsg(err, 'Could not complete'), 'error') }
  }

  const pickUp = async (t: any) => {
    setPicking(t.task_id)
    try {
      await axios.post(`${API}/self-assign`, { task_id: t.task_id }, { headers: await authHeaders() })
      toast(`"${t.description}" added to Up next.`, 'success')
      if (student) await Promise.all([load(student.id), loadSuggested(student.id)])
    } catch (err: any) { toast(errMsg(err, 'Could not pick up this task'), 'error') }
    finally { setPicking(null) }
  }

  // ── Derived ──
  const today = todayKey()
  const byDue = (x: any, y: any) => (x.tasks?.due_date || '9999-12-31').localeCompare(y.tasks?.due_date || '9999-12-31')
  const running = assignments.filter(a => a.status === 'In Progress').sort(byDue)
  const upNext = assignments.filter(a => a.status === 'Assigned').sort(byDue)
  const completed = assignments.filter(a => a.status === 'Completed')
    .sort((x, y) => (y.completed_at || '').localeCompare(x.completed_at || ''))
  const active = running.length + upNext.length
  const [weekEnd] = useState(() => new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10))
  const dueSoon = [...running, ...upNext].filter(a => a.tasks?.due_date && a.tasks.due_date <= weekEnd)
  const overdue = dueSoon.filter(a => a.tasks.due_date < today).length
  const [since30] = useState(() => new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10))
  const done30 = completed.filter(a => (a.completed_at || '').slice(0, 10) >= since30)
  const onTime = (a: any) => !a.tasks?.due_date ? null : (a.completed_at || '').slice(0, 10) <= a.tasks.due_date
  const dated = completed.filter(a => onTime(a) != null)
  const onTimeRate = dated.length ? Math.round(dated.filter(a => onTime(a)).length / dated.length * 100) : null
  const shownDone = doneRange === '30' ? done30 : completed

  const weeks = buckets(56).map(w => {
    const inWeek = completed.filter(a => { const t = Date.parse((a.completed_at || '').slice(0, 10)); return t >= w.from && t < w.to })
    return {
      label: new Date(w.from).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' }),
      values: [inWeek.filter(a => onTime(a) === true).length, inWeek.filter(a => onTime(a) === false).length, inWeek.filter(a => onTime(a) == null).length],
    }
  })
  const series = [
    { label: 'On time', color: 'var(--tm-chart-2)' },
    { label: 'Late', color: 'var(--tm-chart-5)' },
    { label: 'No due date', color: 'var(--tm-chart-6)' },
  ]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const first = (student?.name || '').split(' ')[0]

  const section = (title: string, count: number, hint?: string) => (
    <div className="flex items-baseline gap-2 mb-3">
      <p className="text-sm font-medium text-fg">{title}</p>
      <span className="text-xs text-faint tabular-nums">{count}</span>
      {hint && <span className="text-xs text-faint ml-auto">{hint}</span>}
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader
          title={loading || notFound ? 'My Tasks' : `${greeting}${first ? ', ' + first : ''}`}
          sub={loading || notFound ? 'Start a task to run its timer, then mark it complete when you’re done.'
            : active === 0 ? 'Nothing on your plate right now. Pick something up from the suggestions.'
            : `${running.length} in progress · ${upNext.length} up next${dueSoon.length ? ` · ${dueSoon.length} due this week` : ''}${overdue ? ` · ${overdue} overdue` : ''}`} />

        {loading ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ height: 88 }} />)}</div>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ height: 76 }} />)}
          </div>
        ) : notFound ? (
          <Card tint="amber" className="p-5 max-w-lg">
            <p className="text-sm font-medium mb-1 flex items-center gap-2 text-fg">
              <span style={{ color: 'var(--tm-amber)' }}><Icon name="alert" size={16} /></span>
              No student record linked to your account
            </p>
            <p className="text-xs text-muted">Ask your leader to add you on the Students page using <span className="font-medium text-fg">{userEmail}</span>, then refresh.</p>
          </Card>
        ) : (
          <>
            {/* At a glance */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Card className="p-4">
                <p className="text-[13px] font-medium text-muted">On your plate</p>
                <p className="text-2xl font-semibold tabular-nums text-fg mt-1">{active}<span className="text-sm text-faint">/{WIP_LIMIT}</span></p>
                <div className="flex gap-1 mt-2">
                  {Array.from({ length: WIP_LIMIT }).map((_, i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < active ? (active >= WIP_LIMIT ? 'var(--tm-amber)' : 'var(--tm-primary)') : 'var(--tm-track)' }} />
                  ))}
                </div>
                <p className="text-[11px] text-faint mt-1.5">{active >= WIP_LIMIT ? 'At your limit — finish one first' : `Room for ${WIP_LIMIT - active} more`}</p>
              </Card>
              <Card className="p-4">
                <p className="text-[13px] font-medium text-muted">Due this week</p>
                <p className="text-2xl font-semibold tabular-nums text-fg mt-1">{dueSoon.length}</p>
                <p className="text-[11px] mt-1.5" style={{ color: overdue ? 'var(--tm-rose)' : 'var(--tm-text-faint)' }}>{overdue ? `${overdue} already overdue` : 'Nothing overdue'}</p>
              </Card>
              <Card className="p-4">
                <p className="text-[13px] font-medium text-muted">Finished</p>
                <p className="text-2xl font-semibold tabular-nums text-fg mt-1">{done30.length}</p>
                <p className="text-[11px] text-faint mt-1.5">in the last 30 days · {completed.length} all time</p>
              </Card>
              <Card className="p-4">
                <p className="text-[13px] font-medium text-muted">On time</p>
                <p className="text-2xl font-semibold tabular-nums text-fg mt-1">{onTimeRate == null ? '—' : `${onTimeRate}%`}</p>
                <p className="text-[11px] text-faint mt-1.5">{dated.length ? `of ${dated.length} tasks with a due date` : 'No dated tasks finished yet'}</p>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 flex flex-col gap-6 min-w-0">
                {/* In progress */}
                <section>
                  {section('In progress', running.length, running.length ? 'Timer runs from when you pressed Start' : undefined)}
                  {running.length === 0 ? (
                    <Card className="p-4"><p className="text-sm text-faint">Nothing running. Start a task from Up next when you begin working on it.</p></Card>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {running.map(a => {
                        const spent = hoursSince(a.in_progress_at, now)
                        const budget = a.tasks?.committed_hours
                        const pct = budget ? Math.min(100, (spent / budget) * 100) : 0
                        const over = budget != null && spent > budget
                        return (
                          <Card key={a.id} className="p-5">
                            <div className="flex flex-wrap items-start gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: severityDot(a.tasks?.severity) }} title={`${a.tasks?.severity || 'Low'} severity`} />
                                  <Link href={`/tasks/${a.tasks?.id}`} className="text-[15px] font-medium hover:underline text-fg truncate">{a.tasks?.description || '(task removed)'}</Link>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 pl-4">
                                  <DueChip due={a.tasks?.due_date} />
                                  {a.tasks?.severity && <span className="text-[11px] text-faint">{a.tasks.severity} severity</span>}
                                  {a.tasks?.group_label && <span className="text-[11px] text-faint">{a.tasks.group_label}</span>}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-2xl font-mono font-semibold tabular-nums leading-none text-fg">{clock(a.in_progress_at, now)}</p>
                                <p className="text-[11px] text-faint mt-1">{spent >= 24 ? 'since you started · still working on it?' : 'since you started'}</p>
                              </div>
                            </div>
                            {budget != null && (
                              <div className="mt-4 pl-4">
                                <div className="flex justify-between text-[11px] mb-1">
                                  <span className="text-faint">Budget {budget}h</span>
                                  <span className="tabular-nums" style={{ color: over ? 'var(--tm-amber)' : 'var(--tm-text-faint)' }}>
                                    {over ? `${fmtHours(spent - budget)} over` : `${fmtHours(budget - spent)} left`}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tm-track)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? 'var(--tm-amber)' : 'var(--tm-primary)' }} />
                                </div>
                              </div>
                            )}
                            <div className="flex justify-end gap-2 mt-4">
                              <Link href={`/tasks/${a.tasks?.id}`} className="tm-btn tm-btn-ghost tm-btn-sm">Details</Link>
                              <Button className="tm-btn-sm" onClick={() => setCompleting(a)} disabled={busy === a.id}>
                                <Icon name="check" size={13} /> Mark complete
                              </Button>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </section>

                {/* Up next */}
                <section>
                  {section('Up next', upNext.length, upNext.length ? 'Soonest due first' : undefined)}
                  {upNext.length === 0 ? (
                    <Card className="p-4"><p className="text-sm text-faint">Nothing waiting. New assignments and tasks you pick up land here.</p></Card>
                  ) : (
                    <div className="tm-card divide-y" style={{ borderColor: 'var(--tm-border)' }}>
                      {upNext.map(a => (
                        <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--tm-border)' }}>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: severityDot(a.tasks?.severity) }} title={`${a.tasks?.severity || 'Low'} severity`} />
                          <div className="flex-1 min-w-0">
                            <Link href={`/tasks/${a.tasks?.id}`} className="text-sm hover:underline text-fg">{a.tasks?.description || '(task removed)'}</Link>
                            <div className="flex flex-wrap items-center gap-x-3 mt-0.5">
                              <DueChip due={a.tasks?.due_date} />
                              {a.tasks?.committed_hours != null && <span className="text-[11px] text-faint">{a.tasks.committed_hours}h budget</span>}
                              {a.assigned_date && <span className="text-[11px] text-faint">Assigned {fmtDay(a.assigned_date)}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" className="tm-btn-sm" onClick={() => startTask(a.id)} disabled={busy === a.id}>
                            {busy === a.id ? 'Starting…' : <><Icon name="arrowRight" size={13} /> Start</>}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Done */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="text-sm font-medium text-fg">Done</p>
                    <span className="text-xs text-faint tabular-nums">{shownDone.length}</span>
                    <div className="tm-seg ml-auto">
                      <button aria-pressed={doneRange === '30'} onClick={() => setDoneRange('30')}>Last 30 days</button>
                      <button aria-pressed={doneRange === 'all'} onClick={() => setDoneRange('all')}>All</button>
                    </div>
                  </div>
                  {shownDone.length === 0 ? (
                    <Card><EmptyState icon={<Icon name="check" size={28} />} title={completed.length ? 'Nothing finished in the last 30 days' : 'No completed tasks yet'}
                      hint={completed.length ? 'Switch to All to see older work.' : 'Finished tasks show up here with whether they were on time.'} /></Card>
                  ) : (
                    <div className="tm-card divide-y" style={{ borderColor: 'var(--tm-border)' }}>
                      {shownDone.slice(0, 12).map(a => {
                        const ok = onTime(a)
                        return (
                          <div key={a.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: 'var(--tm-border)' }}>
                            <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--tm-chart-2) 16%, transparent)', color: 'var(--tm-chart-2)' }}>
                              <Icon name="check" size={11} strokeWidth={2.6} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <Link href={`/tasks/${a.tasks?.id}`} className="text-sm hover:underline text-fg truncate block">{a.tasks?.description || '(task removed)'}</Link>
                              <p className="text-[11px] text-faint">
                                {a.completed_at ? `Finished ${fmtDay(a.completed_at.slice(0, 10))}` : 'Finished'}
                                {a.actual_hours != null ? ` · ${Math.round(a.actual_hours * 10) / 10}h spent` : ''}
                                {can(userRole, 'insights.view') && a.timed_hours != null ? ` · ${Math.round(a.timed_hours * 10) / 10}h timed` : ''}
                              </p>
                            </div>
                            {ok != null && (
                              <span className="text-[11px] inline-flex items-center gap-1 shrink-0" style={{ color: ok ? 'var(--tm-text-muted)' : 'var(--tm-rose)' }}>
                                <Icon name={ok ? 'check' : 'alert'} size={11} /> {ok ? 'On time' : 'Late'}
                              </span>
                            )}
                            {can(userRole, 'insights.view') && a.score != null && <span className="tm-chip shrink-0">score {a.score}</span>}
                          </div>
                        )
                      })}
                      {shownDone.length > 12 && <p className="px-4 py-2.5 text-xs text-faint">and {shownDone.length - 12} more</p>}
                    </div>
                  )}
                </section>
              </div>

              {/* Side column */}
              <div className="flex flex-col gap-6 min-w-0">
                <Card className="p-5">
                  <p className="text-sm font-medium text-fg">Your last 8 weeks</p>
                  <p className="text-xs text-faint mb-3">Tasks you finished each week</p>
                  {completed.length === 0
                    ? <p className="text-xs text-faint py-6 text-center">Your weekly progress shows up after your first finished task.</p>
                    : <><StackedColumns data={weeks} series={series} height={120} /><div className="mt-3"><Legend items={series} /></div></>}
                </Card>

                <Card className="p-5">
                  <p className="text-sm font-medium text-fg flex items-center gap-2"><Icon name="sparkle" size={15} /> Suggested for you</p>
                  <p className="text-xs text-faint mb-3">Open tasks that fit your skills</p>
                  {suggested.length === 0 ? (
                    <p className="text-xs text-faint">No open tasks match your skills right now. Adding skills on your profile widens the matches.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {suggested.map(t => (
                        <div key={t.task_id} className="rounded-lg p-3" style={{ background: 'var(--tm-surface-2)' }}>
                          <Link href={`/tasks/${t.task_id}`} className="text-sm text-fg hover:underline">{t.description}</Link>
                          <p className="text-[11px] text-faint mt-0.5">{t.reason}{t.committed_hours != null ? ` · ${t.committed_hours}h` : ''}</p>
                          <Button variant="ghost" className="tm-btn-sm mt-2" onClick={() => pickUp(t)} disabled={picking === t.task_id || active >= WIP_LIMIT}
                            title={active >= WIP_LIMIT ? 'You are at your limit of 3 active tasks' : undefined}>
                            {picking === t.task_id ? 'Adding…' : <><Icon name="plus" size={13} /> Pick up</>}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {student?.group_label && (
                  <Card className="p-5">
                    <p className="text-sm font-medium text-fg flex items-center gap-2"><Icon name="users" size={15} /> Team deadlines</p>
                    <p className="text-xs text-faint mb-3">What {student.group_label} is working on, soonest first</p>
                    {teamTasks.length === 0 ? <p className="text-xs text-faint">Your teammates have nothing active.</p> : (
                      <div className="flex flex-col gap-2.5">
                        {teamTasks.slice(0, 6).map((t, i) => (
                          <div key={i} className="min-w-0">
                            <Link href={`/tasks/${t.id}`} className="text-[13px] text-fg hover:underline truncate block">{t.description}</Link>
                            <div className="flex items-center gap-2"><span className="text-[11px] text-muted truncate">{t.name}</span><DueChip due={t.due_date} /></div>
                          </div>
                        ))}
                        {teamTasks.length > 6 && <p className="text-[11px] text-faint">and {teamTasks.length - 6} more</p>}
                      </div>
                    )}
                  </Card>
                )}
              </div>
            </div>
          </>
        )}

        {completing && <CompleteDialog a={completing} now={now} onClose={() => setCompleting(null)} onDone={h => completeTask(completing, h)} />}
      </main>
    </div>
  )
}
