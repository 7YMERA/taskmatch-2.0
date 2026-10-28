'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, API, authHeaders } from '../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import GettingStarted from '../components/GettingStarted'
import Donut from '../components/Donut'
import { effectiveRole } from '../lib/role'
import { Card, StatTile, Badge, Icon, bandAccent, Skeleton, PageHeader } from '../components/ui'
import { TrendTile, StatusPill, StackedColumns, Heatmap, Legend } from '../components/charts'
import {
  RANGES, RangeKey, windows, buckets, tasksCompleted, onTimeRate, avgScore as avgScoreIn, avgCycleDays,
  skillMatchRate, indexSkills, delta, workloadGrid, skillCoverage, needsAttention, activeDuring,
} from '../lib/analytics'

type Tab = 'overview' | 'workload' | 'skills' | 'performance'
const TABS: [Tab, string][] = [['overview', 'Overview'], ['workload', 'Workload'], ['skills', 'Skills'], ['performance', 'Performance']]
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function Dashboard() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string>('')
  const [userRole, setUserRole] = useState<string>('')
  const [students, setStudents] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [statsList, setStatsList] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [wipData, setWipData] = useState<any>({ wip_limit: 3, at_limit: 0, working: 0, students: [] })
  const [loading, setLoading] = useState(true)
  const [roleReady, setRoleReady] = useState(false)
  const [showAllAttention, setShowAllAttention] = useState(false)
  const [taskSkills, setTaskSkills] = useState<any[]>([])
  const [studentSkills, setStudentSkills] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  // Tab and date range live in the URL so a filtered view can be bookmarked or shared.
  const [tab, setTabState] = useState<Tab>('overview')
  const [range, setRangeState] = useState<RangeKey>('30')
  const setParam = (k: string, v: string) => {
    const u = new URL(window.location.href)
    u.searchParams.set(k, v)
    window.history.replaceState(null, '', u)
  }
  const setTab = (t: Tab) => { setTabState(t); setParam('tab', t) }
  const setRange = (r: RangeKey) => { setRangeState(r); setParam('range', r) }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (TABS.some(([k]) => k === q.get('tab'))) setTabState(q.get('tab') as Tab)
    if (RANGES.some(r => r.key === q.get('range'))) setRangeState(q.get('range') as RangeKey)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')
      setUserRole(effectiveRole(session))
      setRoleReady(true)
    })
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    const { data: studentRows } = await supabase.from('students').select('id, name, programme, email')
    const { data: taskRows } = await supabase.from('tasks').select('id, description, status, severity, due_date, committed_hours, completed_at')
    const { data: assignmentRows } = await supabase.from('assignments').select('task_id, student_id, status, score, actual_hours, completed_at, assigned_date')
    const [{ data: tsRows }, { data: ssRows }, { data: skillRows }] = await Promise.all([
      supabase.from('task_skills').select('task_id, skill_id, min_proficiency'),
      supabase.from('student_skills').select('student_id, skill_id, proficiency'),
      supabase.from('skills').select('id, skill_name'),
    ])
    setStudents(studentRows || [])
    setTasks(taskRows || [])
    setAssignments(assignmentRows || [])
    setTaskSkills(tsRows || [])
    setStudentSkills(ssRows || [])
    setSkills(skillRows || [])
    try {
      const res = await axios.get(`${API}/student-stats`, { headers: await authHeaders() })
      setStatsList(res.data.stats)
    } catch { /* backend down — scores just won't show */ }
    try {
      const wres = await axios.get(`${API}/wip`, { headers: await authHeaders() })
      setWipData(wres.data)
    } catch { /* backend down — WIP panel just won't show */ }
    setLoading(false)
  }

  const initials = (name: string) =>
    name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()


  const scoreBand = (s: number) => s >= 0.6 ? 'high' : s >= 0.4 ? 'avg' : 'low'

  const totalStudents = students.length
  const today = new Date().toISOString().slice(0, 10)

  // SLA states: Delayed = breached & not done (active); Closed = breached & not
  // done past the grace window (locked); Late = delivered after the due date.
  const GRACE_DAYS = 7
  const daysOverdue = (due: string) => Math.floor((Date.parse(today) - Date.parse(due)) / 86400000)
  const isClosed = (t: any) => t.status !== 'Completed' && t.due_date && daysOverdue(t.due_date) > GRACE_DAYS
  const isDelayed = (t: any) => t.status !== 'Completed' && t.due_date && t.due_date < today && !isClosed(t)
  const isLate = (t: any) => t.status === 'Completed' && t.completed_at && t.completed_at.slice(0, 10) > t.due_date

  const newCount = tasks.filter(t => t.status === 'New').length
  const ongoingCount = tasks.filter(t => t.status === 'In Progress').length
  const completedCount = tasks.filter(t => t.status === 'Completed').length
  const delayedCount = tasks.filter(isDelayed).length
  const closedCount = tasks.filter(isClosed).length
  const lateCount = tasks.filter(isLate).length

  // Completed-assignment performance
  const doneAssignments = assignments.filter(a => a.status === 'Completed')

  // Performance grouped by task
  const taskMap: { [id: string]: any } = {}
  tasks.forEach(t => { taskMap[t.id] = t })
  const perTask = Object.values(
    doneAssignments.reduce((acc: any, a: any) => {
      const id = a.task_id
      if (!acc[id]) acc[id] = { task_id: id, scores: [], hours: [], count: 0 }
      if (a.score != null) acc[id].scores.push(a.score)
      if (a.actual_hours != null) acc[id].hours.push(a.actual_hours)
      acc[id].count++
      return acc
    }, {})
  ).map((g: any) => ({
    task_id: g.task_id,
    description: taskMap[g.task_id]?.description || '(removed task)',
    avgScore: g.scores.length ? g.scores.reduce((x: number, y: number) => x + y, 0) / g.scores.length : null,
    avgHours: g.hours.length ? g.hours.reduce((x: number, y: number) => x + y, 0) / g.hours.length : null,
    count: g.count,
  })).filter((t: any) => t.avgScore != null) as any[]

  const byScoreDesc = [...perTask].sort((a, b) => b.avgScore - a.avgScore)
  const fastest = byScoreDesc[0] || null
  const slowest = byScoreDesc.length > 1 ? byScoreDesc[byScoreDesc.length - 1] : null

  // ── Visualization data ──
  // Task lifecycle split (donut). Buckets are MUTUALLY EXCLUSIVE (each task counted once,
  // most-urgent state wins) so the ring is a true part-to-whole of every task. Colours match
  // the status chips used across the app.
  const bucketOf = (t: any) =>
    t.status === 'Completed' ? 'Completed'
      : isClosed(t) ? 'Closed'
        : isDelayed(t) ? 'Delayed'
          : t.status === 'In Progress' ? 'Ongoing'
            : 'New'
  const LIFECYCLE = [
    { label: 'New', color: 'var(--tm-chart-4)' },
    { label: 'Ongoing', color: 'var(--tm-chart-1)' },
    { label: 'Completed', color: 'var(--tm-chart-2)' },
    { label: 'Delayed', color: 'var(--tm-chart-5)' },
    { label: 'Closed', color: 'var(--tm-chart-6)' },
  ]
  const bucketTally = tasks.reduce((acc: any, t: any) => { const b = bucketOf(t); acc[b] = (acc[b] || 0) + 1; return acc }, {})
  const lifecycle = LIFECYCLE.map(s => ({ ...s, value: bucketTally[s.label] || 0 })).filter(s => s.value > 0)
  const lifecycleTotal = lifecycle.reduce((s, x) => s + x.value, 0)  // == tasks.length

  // WIP load — slot bars per student, coloured by how close they are to the limit.
  const wipLimit = wipData.wip_limit ?? 3
  const wipLoaded = (wipData.students || []).filter((s: any) => s.wip > 0)
  const wipColor = (w: number) => w >= wipLimit ? 'var(--tm-chart-5)' : w >= wipLimit - 1 ? 'var(--tm-chart-4)' : 'var(--tm-chart-2)'

  // Task severity mix (leader visual).
  const SEV = [
    { label: 'Critical', color: 'var(--tm-chart-5)' },
    { label: 'Medium', color: 'var(--tm-chart-4)' },
    { label: 'Low', color: 'var(--tm-chart-6)' },
  ]
  const severityData = SEV.map(s => ({ ...s, value: tasks.filter(t => (t.severity || 'Medium') === s.label).length })).filter(s => s.value > 0)

  const isLeader = userRole !== '' && userRole !== 'member'   // admins, leads and viewers get the team dashboard

  // ── Leader analytics for the chosen range (definitions live in lib/analytics.ts) ──
  const rangeDays = RANGES.find(r => r.key === range)!.days
  const { cur, prev } = windows(rangeDays)
  const rangeLabel = rangeDays ? `last ${rangeDays} days` : 'all time'
  const vsLabel = prev ? `vs previous ${rangeDays} days` : ''
  const { req, prof } = indexSkills(taskSkills, studentSkills)
  const spans = buckets(rangeDays)
  const kDone = tasksCompleted(tasks, cur)
  const kOnTime = onTimeRate(tasks, cur)
  const kScore = avgScoreIn(assignments, cur)
  const kCycle = avgCycleDays(assignments, cur)
  const kMatch = skillMatchRate(assignments, cur, req, prof)
  const activeNow = assignments.filter(a => a.status === 'Assigned' || a.status === 'In Progress').length
  const avgActive = totalStudents ? activeNow / totalStudents : null
  const pct = (x: number | null) => x == null ? '—' : `${Math.round(x * 100)}%`

  // Throughput: tasks finished per bucket, split by whether they met their due date.
  const throughput = spans.map(w => {
    const done = tasks.filter(t => t.status === 'Completed' && t.completed_at && Date.parse(t.completed_at.slice(0, 10)) >= w.from && Date.parse(t.completed_at.slice(0, 10)) < w.to)
    const onTime = done.filter(t => t.due_date && t.completed_at.slice(0, 10) <= t.due_date).length
    const late = done.filter(t => t.due_date && t.completed_at.slice(0, 10) > t.due_date).length
    return { label: fmtDay(w.from), values: [onTime, late, done.length - onTime - late] }
  })
  const THROUGHPUT_SERIES = [
    { label: 'On time', color: 'var(--tm-chart-2)' },
    { label: 'Late', color: 'var(--tm-chart-5)' },
    { label: 'No due date', color: 'var(--tm-chart-6)' },
  ]

  const attention = needsAttention(tasks, assignments, students, wipData.wip_limit ?? 3)
  const ATTENTION_META = {
    'overdue': { icon: 'alert' as const, color: 'var(--tm-rose)', word: 'Overdue' },
    'due-soon': { icon: 'clock' as const, color: 'var(--tm-amber)', word: 'Due soon' },
    'unstaffed': { icon: 'user' as const, color: 'var(--tm-sky)', word: 'Unassigned' },
    'at-limit': { icon: 'users' as const, color: 'var(--tm-violet)', word: 'At limit' },
  }
  const grid = workloadGrid(students, assignments, 8)
  const gridMax = Math.max(wipData.wip_limit ?? 3, ...grid.rows.flatMap(r => r.cells))
  const weeklyLoad = grid.cols.map(w => totalStudents ? activeDuring(assignments, w).length / totalStudents : null)

  const coverage = skillCoverage(skills, studentSkills, taskSkills, tasks)
  const LEVEL_COLORS = ['color-mix(in srgb, var(--tm-chart-1) 35%, var(--tm-surface-1))', 'color-mix(in srgb, var(--tm-chart-1) 65%, var(--tm-surface-1))', 'var(--tm-chart-1)']
  const coverageMax = Math.max(1, ...coverage.map(c => c.levels[0] + c.levels[1] + c.levels[2]))
  const RISK = {
    gap: { ok: false, text: 'Gap' }, thin: { ok: false, text: 'Thin' }, ok: { ok: true, text: 'Covered' }, unused: { ok: true, text: 'Not needed now' },
  }

  // ── Student view: my own snapshot (no other students' scores) ──
  const me = students.find(s => (s.email || '').toLowerCase() === userEmail.toLowerCase())
  const myAssignments = me ? assignments.filter(a => a.student_id === me.id) : []
  const myActive = myAssignments.filter(a => a.status === 'Assigned' || a.status === 'In Progress').length
  const myDone = myAssignments.filter(a => a.status === 'Completed')
  const myScored = myDone.filter(a => a.score != null)
  const myAvgScore = myScored.length ? (myScored.reduce((s, a) => s + a.score, 0) / myScored.length).toFixed(2) : '—'
  const myOnTime = myDone.filter(a => { const t = taskMap[a.task_id]; return a.completed_at && t?.due_date && a.completed_at.slice(0, 10) <= t.due_date }).length
  const myOnTimeRate = myDone.length ? Math.round((myOnTime / myDone.length) * 100) : null
  const myStatusData = [
    { label: 'To do', color: 'var(--tm-chart-4)', value: myAssignments.filter(a => a.status === 'Assigned').length },
    { label: 'In progress', color: 'var(--tm-chart-1)', value: myAssignments.filter(a => a.status === 'In Progress').length },
    { label: 'Completed', color: 'var(--tm-chart-2)', value: myDone.length },
  ].filter(x => x.value > 0)

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10 overflow-y-auto">
        <PageHeader title={isLeader ? 'Dashboard' : 'My dashboard'}
          sub={isLeader ? 'How your team and tasks are doing right now.' : 'Your work, scores and what is coming up.'} />

        {roleReady && !loading && (
          <GettingStarted peopleCount={students.length} taskCount={tasks.length} role={userRole} />
        )}

        {!roleReady ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="p-5"><Skeleton style={{ height: 48 }} /></Card>)}
          </div>
        ) : isLeader ? (
        <>
        {/* Section tabs + date range */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="overflow-x-auto pb-1 -mb-1">
            <div className="tm-seg">
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className="whitespace-nowrap !px-3.5">
                  {label}
                </button>
              ))}
            </div>
          </div>
          {(tab === 'overview' || tab === 'performance') && (
            <div className="tm-seg" aria-label="Date range">
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={range === r.key} className="whitespace-nowrap">
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tab === 'overview' && (<>
        {/* KPIs with change vs the previous period */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <TrendTile label="Tasks completed" value={loading ? '…' : kDone} href="/tasks?status=Completed"
            change={prev ? delta(kDone, tasksCompleted(tasks, prev)) : null}
            sub={prev ? `${rangeLabel} · ${vsLabel}` : rangeLabel}
            spark={spans.map(w => tasksCompleted(tasks, w))} />
          <TrendTile label="On-time rate" value={loading ? '…' : pct(kOnTime)}
            change={prev ? delta(kOnTime, onTimeRate(tasks, prev)) : null}
            sub={`${lateCount} finished late overall`}
            spark={spans.map(w => onTimeRate(tasks, w))} />
          <TrendTile label="Avg efficiency score" value={loading ? '…' : (kScore == null ? '—' : kScore.toFixed(2))}
            change={prev ? delta(kScore, avgScoreIn(assignments, prev)) : null}
            sub="1.00 = no time used · 0.50 = on budget" href="/people"
            spark={spans.map(w => avgScoreIn(assignments, w))} />
          <TrendTile label="Avg days to complete" value={loading ? '…' : (kCycle == null ? '—' : `${kCycle.toFixed(1)}d`)}
            change={prev ? delta(kCycle, avgCycleDays(assignments, prev)) : null} goodWhen="down"
            sub="from assignment to done"
            spark={spans.map(w => avgCycleDays(assignments, w))} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
          {/* Needs attention */}
          <Card className="p-5 lg:col-span-3">
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-sm font-semibold text-fg">Needs attention</p>
              <span className="text-xs text-faint">{loading ? '' : `${attention.length} item${attention.length === 1 ? '' : 's'}`}</span>
            </div>
            <p className="text-xs text-faint mb-3">Overdue, due in the next 3 days, unassigned, or people at their limit</p>
            {loading ? <Skeleton style={{ height: 120 }} />
              : attention.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
                  <Icon name="check" size={16} style={{ color: 'var(--tm-emerald)' }} /> Nothing needs you right now.
                </div>
              ) : (
                <ul className="flex flex-col">
                  {(showAllAttention ? attention : attention.slice(0, 6)).map((a, i) => {
                    const m = ATTENTION_META[a.kind]
                    return (
                      <li key={a.kind + a.href + i}>
                        <Link href={a.href} className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-surface-2 transition-colors">
                          <span className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${m.color} 14%, transparent)`, color: m.color }}>
                            <Icon name={m.icon} size={15} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-fg truncate">{a.label}</span>
                            <span className="block text-xs text-faint">{m.word} · {a.detail}</span>
                          </span>
                          <Icon name="arrowRight" size={14} className="text-faint shrink-0" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            {attention.length > 6 && (
              <button className="text-xs text-primary-text mt-2 hover:underline" onClick={() => setShowAllAttention(v => !v)}>
                {showAllAttention ? 'Show fewer' : `Show all ${attention.length}`}
              </button>
            )}
          </Card>

          {/* Matching health — the success measures the original project set itself */}
          <Card className="p-5 lg:col-span-2">
            <p className="text-sm font-semibold text-fg mb-1">Matching health</p>
            <p className="text-xs text-faint mb-4">Is work going to the right people, fairly? ({rangeLabel})</p>
            <div className="flex flex-col divide-y" style={{ borderColor: 'var(--tm-border)' }}>
              {[
                { label: 'Skill-match rate', value: pct(kMatch), target: 'target 85%+', ok: kMatch == null ? null : kMatch >= 0.85,
                  hint: 'Assignments where the person meets every required skill' },
                { label: 'Active tasks per person', value: avgActive == null ? '—' : avgActive.toFixed(1), target: `target ≤ 2 of ${wipLimit}`, ok: avgActive == null ? null : avgActive <= 2,
                  hint: 'Average load right now, across everyone' },
                { label: 'Days to complete', value: kCycle == null ? '—' : `${kCycle.toFixed(1)}d`, target: prev ? 'target: faster than before' : 'pick a range to compare',
                  ok: (() => { const p = prev ? avgCycleDays(assignments, prev) : null; return kCycle == null || p == null ? null : kCycle <= p })(),
                  hint: prev ? `Previous period: ${(() => { const p = avgCycleDays(assignments, prev); return p == null ? 'no data' : p.toFixed(1) + 'd' })()}` : 'Average over all time' },
              ].map(r => (
                <div key={r.label} className="py-3 first:pt-0 last:pb-0" style={{ borderColor: 'var(--tm-border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-fg">{r.label}</p>
                    <StatusPill ok={loading ? null : r.ok} />
                  </div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-semibold tabular-nums text-fg">{loading ? '…' : r.value}</span>
                    <span className="text-xs text-faint">{r.target}</span>
                  </div>
                  <p className="text-[11px] text-faint mt-0.5">{r.hint}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Throughput */}
        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-fg mb-1">Tasks finished</p>
              <p className="text-xs text-faint">Per {rangeDays && rangeDays <= 7 ? 'day' : 'week'}, {rangeLabel === 'all time' ? 'last 12 weeks' : rangeLabel} · hover a bar for detail</p>
            </div>
            <Legend items={THROUGHPUT_SERIES} />
          </div>
          {loading ? <Skeleton style={{ height: 180 }} /> : <StackedColumns data={throughput} series={THROUGHPUT_SERIES} />}
        </Card>

        {/* Lifecycle status breakdown — each card opens the Tasks page pre-filtered */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'New', value: newCount, accent: 'amber' as const, sub: 'awaiting assignment', filter: 'New' },
            { label: 'Ongoing', value: ongoingCount, accent: 'emerald' as const, sub: 'in progress', filter: 'In Progress' },
            { label: 'Completed', value: completedCount, accent: 'sky' as const, sub: `done${lateCount ? ` · ${lateCount} late` : ''}`, filter: 'Completed' },
            { label: 'Delayed', value: delayedCount, accent: 'rose' as const, sub: 'SLA breached, not done', filter: 'Delayed' },
            { label: 'Closed', value: closedCount, accent: 'indigo' as const, sub: `auto-locked > ${GRACE_DAYS}d overdue`, filter: 'Closed' },
          ].map(m => (
            <Link key={m.label} href={`/tasks?status=${encodeURIComponent(m.filter)}`} className="block">
              <StatTile label={m.label} value={loading ? '…' : m.value} accent={m.accent} sub={m.sub} />
            </Link>
          ))}
        </div>
        </>)}

        {tab === 'workload' && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <TrendTile label="Active tasks per person" value={loading ? '…' : (avgActive == null ? '—' : avgActive.toFixed(1))}
            change={delta(weeklyLoad[weeklyLoad.length - 1], weeklyLoad[weeklyLoad.length - 2])} goodWhen="down"
            sub="this week vs last week" spark={weeklyLoad} />
          <StatTile label="At the limit" value={loading ? '…' : wipData.at_limit} accent="rose" sub={`${wipLimit} active tasks`} />
          <StatTile label="Working" value={loading ? '…' : wipData.working} accent="emerald" sub="have at least one task" />
          <StatTile label="Free" value={loading ? '…' : Math.max(0, totalStudents - wipData.working)} accent="sky" sub="no active tasks" />
        </div>

        {/* Workload heatmap */}
        <Card className="p-5 mb-6">
          <p className="text-sm font-semibold text-fg mb-1">Workload over time</p>
          <p className="text-xs text-faint mb-4">Active tasks per person, week by week (last 8 weeks) · busiest first</p>
          {loading ? <Skeleton style={{ height: 200 }} />
            : grid.rows.length === 0 ? <p className="text-faint text-sm">No students yet.</p>
            : <Heatmap rows={grid.rows.map(r => ({ id: r.student.id, label: r.student.name, cells: r.cells }))}
                cols={grid.cols.map(w => fmtDay(w.from))} max={gridMax} limit={wipLimit} rowHref={id => `/people/${id}`} />}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Work in progress (WIP) tracker */}
        <div className="tm-card p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-fg">Right now</p>
            <span className="text-xs text-faint">Limit {wipLimit} active tasks / person</span>
          </div>
          <p className="text-xs text-faint mb-4">
            {loading ? 'Loading…' : `${wipData.at_limit} at limit · ${wipData.working} working · ${Math.max(0, totalStudents - wipData.working)} free`}
          </p>
          {loading ? <p className="text-faint text-sm">Loading…</p>
            : wipLoaded.length === 0 ? <p className="text-faint text-sm">No one has an active task right now.</p>
            : (
              <div className="flex flex-col gap-2.5">
                {wipLoaded.map((s: any) => (
                  <Link key={s.student_id} href={`/people/${s.student_id}`}
                    className="flex items-center gap-3 hover:bg-surface-2 -mx-2 px-2 py-1 rounded transition"
                    title={s.active_tasks?.map((t: any) => t.description).filter(Boolean).join(' · ')}>
                    <span className="text-xs text-muted w-32 truncate shrink-0">{s.name}</span>
                    <div className="flex-1 flex gap-1">
                      {Array.from({ length: wipLimit }).map((_, i) => (
                        <div key={i} className="h-3 flex-1 rounded-sm" style={{ backgroundColor: i < s.wip ? wipColor(s.wip) : 'var(--tm-track)' }} />
                      ))}
                    </div>
                    <span className="text-xs tabular-nums w-9 text-right text-muted">{s.wip}/{wipLimit}</span>
                  </Link>
                ))}
              </div>
            )}
          {!loading && wipData.at_limit > 0 && (
            <p className="text-[11px] text-[color:var(--tm-rose)] mt-3 flex items-center gap-1"><Icon name="alert" size={12} /> {wipData.at_limit} {wipData.at_limit === 1 ? 'person is' : 'people are'} at the limit and can&apos;t take new tasks until they finish something.</p>
          )}
        </div>

        {/* Task severity mix */}
        <div className="tm-card p-5">
          <p className="text-sm font-semibold text-fg mb-1">Task severity</p>
          <p className="text-xs text-faint mb-3">How the {tasks.length} task{tasks.length === 1 ? '' : 's'} break down by priority</p>
          {loading ? <p className="text-faint text-sm">Loading…</p>
            : severityData.length === 0 ? <p className="text-faint text-sm">No tasks yet.</p>
            : <Donut data={severityData} centerLabel="tasks" />}
        </div>
        </div>
        </>)}

        {tab === 'skills' && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatTile label="Skill gaps" value={loading ? '…' : coverage.filter(c => c.risk === 'gap').length} accent="rose" sub="needed, nobody at Intermediate+" />
          <StatTile label="Thin skills" value={loading ? '…' : coverage.filter(c => c.risk === 'thin').length} accent="amber" sub="fewer people than open tasks" />
          <StatTile label="Covered" value={loading ? '…' : coverage.filter(c => c.risk === 'ok').length} accent="emerald" sub="enough people for the work" />
          <StatTile label="Skill-match rate" value={loading ? '…' : pct(kMatch)} accent="indigo" sub={rangeLabel} />
        </div>

        <Card className="p-5 mb-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-fg mb-1">Skills coverage</p>
              <p className="text-xs text-faint">Who holds each skill, against how many open tasks need it · riskiest first</p>
            </div>
            <Legend items={['Beginner', 'Intermediate', 'Advanced'].map((l, i) => ({ label: l, color: LEVEL_COLORS[i] }))} />
          </div>
          {loading ? <Skeleton style={{ height: 240 }} />
            : coverage.length === 0 ? <p className="text-faint text-sm">No skills declared yet.</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-faint">
                      <th className="font-normal pb-2 pr-3">Skill</th>
                      <th className="font-normal pb-2 pr-3 w-1/2">People by level</th>
                      <th className="font-normal pb-2 pr-3 text-right whitespace-nowrap">Open tasks</th>
                      <th className="font-normal pb-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.map(c => {
                      const total = c.levels[0] + c.levels[1] + c.levels[2]
                      return (
                        <tr key={c.skill.id} className="border-t" style={{ borderColor: 'var(--tm-border)' }}>
                          <td className="py-2.5 pr-3 text-fg whitespace-nowrap">{c.skill.skill_name}</td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="flex gap-[2px] h-2.5 flex-1" title={`${c.levels[0]} Beginner · ${c.levels[1]} Intermediate · ${c.levels[2]} Advanced`}>
                                {c.levels.map((n, i) => n > 0 && (
                                  <div key={i} style={{ width: `${(n / coverageMax) * 100}%`, background: LEVEL_COLORS[i], borderRadius: 3 }} />
                                ))}
                              </div>
                              <span className="text-xs text-muted tabular-nums w-14 text-right">{total} {total === 1 ? 'person' : 'people'}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-muted">{c.demand}</td>
                          <td className="py-2.5 text-right">
                            {c.risk === 'unused'
                              ? <span className="text-xs text-faint whitespace-nowrap">Not needed now</span>
                              : <StatusPill ok={RISK[c.risk].ok} okText={RISK[c.risk].text} badText={RISK[c.risk].text} />}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          <p className="text-[11px] text-faint mt-3">A skill is thin when fewer people hold it at Intermediate or above than there are open tasks needing it.</p>
        </Card>
        </>)}

        {tab === 'performance' && (<>
        {/* Fastest / slowest task */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {[
            { title: 'Fastest task', icon: '', t: fastest },
            { title: 'Slowest task', icon: '', t: slowest },
          ].map(card => (
            <div key={card.title} className="tm-card p-5">
              <p className="text-sm font-semibold text-fg mb-1">{card.title}</p>
              <p className="text-xs text-faint mb-3">By efficiency score (committed vs actual hours)</p>
              {loading ? <p className="text-faint text-sm">Loading…</p>
                : !card.t ? <p className="text-faint text-sm">Not enough completed tasks yet.</p>
                : (
                  <Link href={`/tasks/${card.t.task_id}`} className="block hover:bg-surface-2 -mx-2 px-2 py-1 rounded transition">
                    <p className="text-sm text-fg truncate">{card.t.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge accent={bandAccent(scoreBand(card.t.avgScore))}>score {card.t.avgScore.toFixed(2)}</Badge>
                      {card.t.avgHours != null && <span className="text-xs text-faint">avg {Math.round(card.t.avgHours * 10) / 10}h</span>}
                      <span className="text-xs text-faint">· {card.t.count} contributor{card.t.count === 1 ? '' : 's'}</span>
                    </div>
                  </Link>
                )}
            </div>
          ))}
        </div>

        {/* Performance by task + Team performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="tm-card p-5">
            <p className="text-sm font-semibold text-fg mb-1">Performance by task</p>
            <p className="text-xs text-faint mb-4">Completed tasks — avg time &amp; efficiency, best first</p>
            {loading ? <p className="text-faint text-sm">Loading…</p>
              : perTask.length === 0 ? <p className="text-faint text-sm">No completed tasks yet.</p>
              : (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                  {byScoreDesc.map(t => (
                    <Link key={t.task_id} href={`/tasks/${t.task_id}`}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-surface-2 transition-colors">
                      <span className="flex-1 text-sm text-fg truncate">{t.description}</span>
                      {t.avgHours != null && <span className="text-xs text-faint">{Math.round(t.avgHours * 10) / 10}h</span>}
                      <Badge accent={bandAccent(scoreBand(t.avgScore))}>{t.avgScore.toFixed(2)}</Badge>
                    </Link>
                  ))}
                </div>
              )}
          </div>

          <div className="tm-card p-5">
            <p className="text-sm font-semibold text-fg mb-1">Individual performance</p>
            <p className="text-xs text-faint mb-4">Each student&apos;s average score (efficiency vs committed hours)</p>
            {loading ? (
              <p className="text-faint text-sm">Loading...</p>
            ) : statsList.length === 0 ? (
              <p className="text-faint text-sm">No students yet.</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {[...statsList].sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1)).map(s => (
                  <Link key={s.student_id} href={`/people/${s.student_id}`}
                    className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-surface-2 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-primary-soft text-primary-text flex items-center justify-center text-xs font-semibold shrink-0">
                      {initials(s.name)}
                    </div>
                    <span className="flex-1 text-sm text-fg truncate">{s.name}</span>
                    <span className="text-xs text-faint">{s.completed_count} done</span>
                    <Badge accent={bandAccent(s.band)}>
                      {s.band === 'unrated' ? 'Unrated' : `${s.avg_score} · ${s.band}`}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        </>)}
        </>
        ) : (
          <>
            {/* Student personal snapshot — no other students' scores */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'My active tasks', value: `${myActive}`, sub: `of ${wipLimit} WIP limit`, accent: (myActive >= wipLimit ? 'rose' as const : 'indigo' as const) },
                { label: 'Completed', value: `${myDone.length}`, sub: 'tasks done', accent: 'sky' as const },
                { label: 'My avg score', value: `${myAvgScore}`, sub: myScored.length ? `${myScored.length} scored` : 'none yet', accent: 'violet' as const },
                { label: 'On time', value: myOnTimeRate == null ? '—' : `${myOnTimeRate}%`, sub: `${myOnTime}/${myDone.length} completed`, accent: ((myOnTimeRate ?? 100) >= 80 ? 'emerald' as const : 'amber' as const) },
              ].map(m => (
                <StatTile key={m.label} label={m.label} value={loading ? '…' : m.value} accent={m.accent} sub={m.sub} />
              ))}
            </div>

            {!me && !loading ? (
              <div className="tm-card p-6 mb-6 max-w-lg">
                <p className="text-sm text-fg mb-1">No student record linked to your account.</p>
                <p className="text-xs text-faint">Ask your leader to add you on the Students page using {userEmail}, then refresh.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="tm-card p-5">
                  <p className="text-sm font-semibold text-fg mb-1">My tasks</p>
                  <p className="text-xs text-faint mb-3">Your work across all states</p>
                  {loading ? <p className="text-faint text-sm">Loading…</p>
                    : myStatusData.length === 0 ? <p className="text-faint text-sm">Nothing assigned yet — see “Suggested for you” on your profile.</p>
                    : <Donut data={myStatusData} centerLabel="my tasks" />}
                </div>
                <div className="tm-card p-5">
                  <p className="text-sm font-semibold text-fg mb-1">Project progress</p>
                  <p className="text-xs text-faint mb-3">Where all {tasks.length} tasks stand</p>
                  {loading ? <p className="text-faint text-sm">Loading…</p>
                    : lifecycleTotal === 0 ? <p className="text-faint text-sm">No tasks yet.</p>
                    : <Donut data={lifecycle} centerLabel="tasks" />}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Link href="/my-tasks" className="tm-btn tm-btn-primary">Go to My Tasks <Icon name="arrowRight" size={16} /></Link>
              <Link href="/profile" className="tm-btn tm-btn-ghost">See suggested tasks</Link>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
