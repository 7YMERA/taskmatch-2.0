/* Dashboard analytics: pure functions over the rows the dashboard already loads.
   No network, no React — so every number on the dashboard has one definition. */

export type Task = {
  id: string; description: string; status: string; severity?: string | null
  due_date?: string | null; committed_hours?: number | null; completed_at?: string | null
}
export type Assignment = {
  task_id: string; student_id: string; status: string; score?: number | null
  actual_hours?: number | null; completed_at?: string | null; assigned_date?: string | null
}
export type Student = { id: string; name: string; email?: string | null }
export type TaskSkill = { task_id: string; skill_id: string; min_proficiency: number }
export type StudentSkill = { student_id: string; skill_id: string; proficiency: number }
export type Skill = { id: string; skill_name: string }

export const DAY = 86400000
export const RANGES = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: 0 },
] as const
export type RangeKey = typeof RANGES[number]['key']

const dayOf = (iso?: string | null) => (iso ? Date.parse(iso.slice(0, 10)) : NaN)
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/* A window is [from, to) in ms since epoch. "All time" starts at 0. */
export type Window = { from: number; to: number }
export function windows(days: number, now = Date.now()): { cur: Window; prev: Window | null } {
  const today = Date.parse(new Date(now).toISOString().slice(0, 10)) + DAY  // end of today
  if (!days) return { cur: { from: 0, to: today }, prev: null }
  return {
    cur: { from: today - days * DAY, to: today },
    prev: { from: today - 2 * days * DAY, to: today - days * DAY },
  }
}
const inWin = (t: number, w: Window) => t >= w.from && t < w.to

/* Buckets for sparklines and the throughput chart: daily for the 7-day range, weekly otherwise. */
export function buckets(days: number, now = Date.now()): Window[] {
  const end = Date.parse(new Date(now).toISOString().slice(0, 10)) + DAY
  const [n, size] = days && days <= 7 ? [days, DAY] : [days ? Math.ceil(days / 7) : 12, 7 * DAY]
  return Array.from({ length: n }, (_, i) => ({ from: end - (n - i) * size, to: end - (n - i - 1) * size }))
}

/* ─── KPI definitions ─── */

export function tasksCompleted(tasks: Task[], w: Window) {
  return tasks.filter(t => t.status === 'Completed' && inWin(dayOf(t.completed_at), w)).length
}

/** Share of tasks finished in the window that met their due date (tasks without one are skipped). */
export function onTimeRate(tasks: Task[], w: Window): number | null {
  const done = tasks.filter(t => t.status === 'Completed' && t.due_date && inWin(dayOf(t.completed_at), w))
  if (!done.length) return null
  return done.filter(t => (t.completed_at || '').slice(0, 10) <= (t.due_date as string)).length / done.length
}

export function avgScore(asg: Assignment[], w: Window): number | null {
  return avg(asg.filter(a => a.status === 'Completed' && a.score != null && inWin(dayOf(a.completed_at), w))
    .map(a => a.score as number))
}

/** Average days from assignment to completion, for assignments finished in the window. */
export function avgCycleDays(asg: Assignment[], w: Window): number | null {
  return avg(asg.filter(a => a.status === 'Completed' && a.assigned_date && inWin(dayOf(a.completed_at), w))
    .map(a => Math.max(0, (dayOf(a.completed_at) - dayOf(a.assigned_date)) / DAY)))
}

/** Assignments active at any point in the window: given before it ended, not finished before it began. */
export function activeDuring(asg: Assignment[], w: Window) {
  return asg.filter(a => {
    const start = dayOf(a.assigned_date)
    if (isNaN(start) || start >= w.to) return false
    const end = a.status === 'Completed' ? dayOf(a.completed_at) : Infinity
    return isNaN(end) || end >= w.from
  })
}

/** Does this person (by their current skill profile) meet every requirement of this task? */
export function meetsTask(taskId: string, studentId: string, req: Map<string, TaskSkill[]>, prof: Map<string, Map<string, number>>) {
  const needs = req.get(taskId) || []
  if (!needs.length) return true
  const mine = prof.get(studentId)
  return needs.every(n => (mine?.get(n.skill_id) || 0) >= n.min_proficiency)
}

export function indexSkills(taskSkills: TaskSkill[], studentSkills: StudentSkill[]) {
  const req = new Map<string, TaskSkill[]>()
  taskSkills.forEach(ts => req.set(ts.task_id, [...(req.get(ts.task_id) || []), ts]))
  const prof = new Map<string, Map<string, number>>()
  studentSkills.forEach(s => {
    if (!prof.has(s.student_id)) prof.set(s.student_id, new Map())
    prof.get(s.student_id)!.set(s.skill_id, s.proficiency)
  })
  return { req, prof }
}

/** Share of assignments given in the window where the person meets every required skill. */
export function skillMatchRate(asg: Assignment[], w: Window, req: Map<string, TaskSkill[]>, prof: Map<string, Map<string, number>>) {
  const given = asg.filter(a => inWin(dayOf(a.assigned_date), w))
  if (!given.length) return null
  return given.filter(a => meetsTask(a.task_id, a.student_id, req, prof)).length / given.length
}

/** Percentage change from prev to cur, or null when there is nothing to compare against. */
export function delta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null
  return (cur - prev) / Math.abs(prev)
}

/* ─── Workload heatmap: people × weeks, value = tasks on their plate that week ─── */

export function workloadGrid(students: Student[], asg: Assignment[], weeks = 8, now = Date.now()) {
  const cols = buckets(weeks * 7, now)
  const rows = students.map(s => {
    const mine = asg.filter(a => a.student_id === s.id)
    return { student: s, cells: cols.map(w => activeDuring(mine, w).length) }
  })
  rows.sort((a, b) => b.cells[b.cells.length - 1] - a.cells[a.cells.length - 1] || a.student.name.localeCompare(b.student.name))
  return { cols, rows }
}

/* ─── Skills coverage: who holds each skill (by level) vs how many open tasks need it ─── */

export type Coverage = {
  skill: Skill; levels: [number, number, number]; demand: number; supply: number
  risk: 'gap' | 'thin' | 'ok' | 'unused'
}
export function skillCoverage(skills: Skill[], studentSkills: StudentSkill[], taskSkills: TaskSkill[], tasks: Task[]): Coverage[] {
  const open = new Set(tasks.filter(t => t.status !== 'Completed').map(t => t.id))
  const out = skills.map(skill => {
    const levels: [number, number, number] = [0, 0, 0]
    studentSkills.filter(s => s.skill_id === skill.id).forEach(s => {
      const i = Math.min(3, Math.max(1, s.proficiency)) - 1
      levels[i]++
    })
    const demand = taskSkills.filter(ts => ts.skill_id === skill.id && open.has(ts.task_id)).length
    const supply = levels[1] + levels[2]  // Intermediate or above can carry a task on their own
    const risk: Coverage['risk'] = demand === 0 ? 'unused' : supply === 0 ? 'gap' : supply < demand ? 'thin' : 'ok'
    return { skill, levels, demand, supply, risk }
  })
  const order = { gap: 0, thin: 1, ok: 2, unused: 3 }
  return out
    .filter(c => c.demand > 0 || c.levels.some(Boolean))
    .sort((a, b) => order[a.risk] - order[b.risk] || b.demand - a.demand || a.skill.skill_name.localeCompare(b.skill.skill_name))
}

/* ─── Needs attention: what a lead should look at today ─── */

export type Attention = { kind: 'overdue' | 'due-soon' | 'unstaffed' | 'at-limit'; label: string; detail: string; href: string }
export function needsAttention(tasks: Task[], asg: Assignment[], students: Student[], wipLimit: number, now = Date.now()): Attention[] {
  const today = new Date(now).toISOString().slice(0, 10)
  const soon = new Date(now + 3 * DAY).toISOString().slice(0, 10)
  const active = asg.filter(a => a.status === 'Assigned' || a.status === 'In Progress')
  const staffed = new Set(active.map(a => a.task_id))
  const items: Attention[] = []
  const open = tasks.filter(t => t.status !== 'Completed')
  const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

  open.filter(t => t.due_date && t.due_date < today)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
    .forEach(t => items.push({ kind: 'overdue', label: t.description, href: `/tasks/${t.id}`,
      detail: `${daysBetween(t.due_date as string, today)}d overdue` }))
  open.filter(t => t.due_date && t.due_date >= today && t.due_date <= soon)
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
    .forEach(t => items.push({ kind: 'due-soon', label: t.description, href: `/tasks/${t.id}`,
      detail: t.due_date === today ? 'due today' : `due in ${daysBetween(today, t.due_date as string)}d` }))
  // A dated task with nobody on it is already listed above; say so there instead of twice.
  items.forEach(it => {
    const t = open.find(o => it.href === `/tasks/${o.id}`)
    if (t && t.status === 'New' && !staffed.has(t.id)) it.detail += ' · nobody assigned'
  })
  open.filter(t => t.status === 'New' && !staffed.has(t.id) && !(t.due_date && t.due_date <= soon))
    .forEach(t => items.push({ kind: 'unstaffed', label: t.description, href: `/tasks/${t.id}`, detail: 'nobody assigned' }))
  const load = new Map<string, number>()
  active.forEach(a => load.set(a.student_id, (load.get(a.student_id) || 0) + 1))
  students.filter(s => (load.get(s.id) || 0) >= wipLimit)
    .forEach(s => items.push({ kind: 'at-limit', label: s.name, href: `/students/${s.id}`, detail: `${load.get(s.id)}/${wipLimit} active tasks` }))
  return items
}
