'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, API, authHeaders } from '../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import { logActivity } from '../lib/log'
import Sidebar from '../components/Sidebar'
import SkillPicker from '../components/SkillPicker'
import { effectiveRole } from '../lib/role'
import { toast, confirmDialog } from '../lib/ui'
import { Card, Badge, Button, Input, Field, Icon, EmptyState, Skeleton, SkeletonCard, bandAccent } from '../components/ui'

const PAGE_SIZE = 5
const SEVERITIES = ['Low', 'Medium', 'Critical']
const GROUP_COLORS = ['#a78bfa', '#34d399', '#38bdf8', '#fbbf24', '#fb7185', '#2dd4bf', '#fb923c', '#f472b6']

// Theme-token text colours, so copy flips correctly between dark and light.
const TEXT = { color: 'var(--tm-text)' }
const MUTED = { color: 'var(--tm-text-muted)' }
const FAINT = { color: 'var(--tm-text-faint)' }
const AVATAR = { background: 'rgba(99,102,241,0.18)', color: 'var(--tm-indigo)' }
// backdrop-filter/transform on .tm-card would trap the menu's fixed click-away layer inside the card.
const MENU_HOST = { backdropFilter: 'none', transform: 'none' }

export default function Tasks() {
  const router = useRouter()
  const [tasks, setTasks] = useState<any[]>([])
  const [skills, setSkills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ description: '', committed_hours: '', severity: '', start_date: '', due_date: '', group_label: '' })
  const [groupFilter, setGroupFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [groups, setGroups] = useState<any[]>([])
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupForm, setGroupForm] = useState<{ name: string, color: string, members: string[] }>({ name: '', color: GROUP_COLORS[0], members: [] })
  const [taskSkills, setTaskSkills] = useState<{ skill_id: string, min_proficiency: number }[]>([])
  const [recommendations, setRecommendations] = useState<{ [task_id: string]: any[] }>({})
  const [recMeta, setRecMeta] = useState<{ [task_id: string]: { suggested_pair: any, assigned_count: number } }>({})
  const [recPage, setRecPage] = useState<{ [task_id: string]: number }>({})
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [taskAssignees, setTaskAssignees] = useState<{ [task_id: string]: any[] }>({})
  const [taskMenuOpen, setTaskMenuOpen] = useState<string | null>(null)   // per-row "⋯" actions menu

  useEffect(() => {
    // Open with a status filter if the dashboard (or a link) passed ?status=...
    const fromUrl = new URLSearchParams(window.location.search).get('status')
    if (fromUrl) setStatusFilter(fromUrl)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')
      setUserRole(effectiveRole(session))
    })
    fetchTasks()
    fetchSkills()
    fetchGroups()
  }, [])

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('tasks')
      .select('*, task_skills(skill_id, min_proficiency, skills(skill_name))')
      .order('status')
    setTasks(data || [])
    setLoading(false)
  }

  const fetchGroups = async () => {
    const { data } = await supabase.from('groups').select('*')
    setGroups(data || [])
  }

  const groupColor = (name: string) => groups.find(g => g.name === name)?.color || '#a78bfa'

  const createGroup = async () => {
    const name = groupForm.name.trim()
    if (!name) return toast('Enter a group name', 'error')
    // Reuse an existing group (e.g. one made on the Students page) or create a new one.
    const existing = groups.find(g => g.name === name)
    if (!existing) {
      const { error } = await supabase.from('groups').insert({ name, color: groupForm.color, created_by: userEmail })
      if (error) return toast(error.message, 'error')
    }
    if (groupForm.members.length > 0) {
      await supabase.from('tasks').update({ group_label: name }).in('id', groupForm.members)
    }
    await logActivity({
      action: 'group.tasks_assigned', entity_type: 'group',
      summary: `Assigned ${groupForm.members.length} task${groupForm.members.length === 1 ? '' : 's'} to group '${name}'`,
      details: { members: groupForm.members, existing: !!existing },
    })
    setGroupForm({ name: '', color: GROUP_COLORS[0], members: [] })
    setShowGroupForm(false)
    fetchGroups()
    fetchTasks()
  }

  const fetchSkills = async () => {
    const { data } = await supabase.from('skills').select('*')
    setSkills(data || [])
  }

  const createTask = async () => {
    if (!form.description) return toast('Enter a task description', 'error')
    if (taskSkills.length === 0) return toast('Select at least one required skill', 'error')

    const severity = form.severity || 'Medium'  // default only if left unset
    const { data, error } = await supabase.from('tasks').insert({
      description: form.description,
      committed_hours: parseFloat(form.committed_hours) || null,
      severity,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      group_label: form.group_label.trim() || null,
      status: 'New'
    }).select().single()

    if (error) return toast(error.message, 'error')

    await supabase.from('task_skills').insert(
      taskSkills.map(s => ({ task_id: data.id, skill_id: s.skill_id, min_proficiency: s.min_proficiency }))
    )

    await logActivity({
      action: 'task.created', entity_type: 'task', entity_id: data.id,
      summary: `Created task '${form.description}' (${severity}${form.committed_hours ? `, ${form.committed_hours}h` : ''}${form.group_label ? `, group ${form.group_label}` : ''})`,
      details: { description: form.description, severity, committed_hours: form.committed_hours, group_label: form.group_label, skills: taskSkills },
    })

    setForm({ description: '', committed_hours: '', severity: '', start_date: '', due_date: '', group_label: '' })
    setTaskSkills([])
    setShowForm(false)
    fetchTasks()
  }

  const fetchAssignees = async (task_id: string) => {
    const { data } = await supabase
      .from('assignments')
      .select('id, student_id, status, score, students(name)')
      .eq('task_id', task_id)
    setTaskAssignees(prev => ({ ...prev, [task_id]: data || [] }))
  }

  const loadRecommendations = async (task_id: string) => {
    if (expandedTask === task_id) { setExpandedTask(null); return }
    setExpandedTask(task_id)
    setRecPage(prev => ({ ...prev, [task_id]: 0 }))
    fetchAssignees(task_id)          // who's actually on it (shown for started tasks)
    if (recommendations[task_id]) return
    try {
      const res = await axios.get(`${API}/recommend/${task_id}`, { headers: await authHeaders() })
      setRecommendations(prev => ({ ...prev, [task_id]: res.data.recommendations }))
      setRecMeta(prev => ({ ...prev, [task_id]: { suggested_pair: res.data.suggested_pair, assigned_count: res.data.assigned_count } }))
    } catch {
      setRecommendations(prev => ({ ...prev, [task_id]: [] }))
    }
  }

  const assignStudent = async (task_id: string, student_id: string, name: string) => {
    if (assigning) return           // ignore rapid double-clicks while a request is in flight
    setAssigning(student_id)
    try {
      await axios.post(`${API}/assign`, { task_id, student_id }, { headers: await authHeaders() })
      const res = await axios.get(`${API}/recommend/${task_id}`, { headers: await authHeaders() })
      setRecommendations(prev => ({ ...prev, [task_id]: res.data.recommendations }))
      setRecMeta(prev => ({ ...prev, [task_id]: { suggested_pair: res.data.suggested_pair, assigned_count: res.data.assigned_count } }))
      fetchAssignees(task_id)
      fetchTasks()
      toast(`${name} assigned!`, 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Could not assign', 'error')
    } finally {
      setAssigning(null)
    }
  }

  const deleteTask = async (id: string, description: string) => {
  if (!(await confirmDialog({ title: 'Delete task?', message: `"${description}" and its assignments will be removed. This can't be undone.`, danger: true, confirmLabel: 'Delete' }))) return
  await supabase.from('task_skills').delete().eq('task_id', id)
  await supabase.from('assignments').delete().eq('task_id', id)
  await supabase.from('tasks').delete().eq('id', id)
  await logActivity({ action: 'task.deleted', entity_type: 'task', entity_id: id, summary: `Deleted task '${description}'` })
  fetchTasks()
}

const updateTaskStatus = async (id: string, status: string) => {
  await supabase.from('tasks').update({ status }).eq('id', id)
  await logActivity({ action: 'task.status_changed', entity_type: 'task', entity_id: id, summary: `Task status set to ${status}`, details: { status } })
  fetchTasks()
}

  // Status / severity → design-system accents (same colours as the dashboard tiles).
  const statusAccent = (status: string) =>
    status === 'New' ? 'amber' as const
      : status === 'In Progress' || status === 'Assigned' ? 'emerald' as const
        : status === 'Completed' ? 'sky' as const
          : 'indigo' as const
  const statusLabel = (s: string) => s === 'In Progress' ? 'Ongoing' : s

  // Calm indicators — small dots carry the signal instead of filled pills.
  const severityDot = (s: string) => s === 'Critical' ? 'var(--tm-rose)' : s === 'Medium' ? 'var(--tm-amber)' : 'var(--tm-text-faint)'
  const statusDot = (s: string) => s === 'New' ? 'var(--tm-amber)' : s === 'In Progress' ? 'var(--tm-emerald)' : s === 'Completed' ? 'var(--tm-sky)' : 'var(--tm-text-faint)'

  // SLA-style states. Delayed = breached & not done (active). Closed = breached
  // & not done past the grace window (auto-locked). Late = delivered after due.
  const GRACE_DAYS = 7
  const todayStr = new Date().toISOString().slice(0, 10)
  const daysOverdue = (due: string) => Math.floor((Date.parse(todayStr) - Date.parse(due)) / 86400000)
  const isClosed = (t: any) => t.status !== 'Completed' && t.due_date && daysOverdue(t.due_date) > GRACE_DAYS
  const isDelayed = (t: any) => t.status !== 'Completed' && t.due_date && t.due_date < todayStr && !isClosed(t)
  const isLate = (t: any) => t.status === 'Completed' && t.completed_at && t.completed_at.slice(0, 10) > t.due_date

  const bandChip = (band: string, avg: number | null) => {
    if (band === 'unrated') return <span className="tm-chip">unrated</span>
    return <Badge accent={bandAccent(band)}>{`${band} ${avg ?? ''}`.trim()}</Badge>
  }

  const initials = (name: string) =>
    name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  // Groups come from the canonical `groups` table (shared with the Students tab) unioned with any
  // labels present on tasks — so a group made on either tab shows here, even before it has a task.
  const _groupCreatedAt: { [name: string]: number } = {}
  groups.forEach(g => { _groupCreatedAt[g.name] = new Date(g.created_at).getTime() })
  const existingGroups = (Array.from(new Set([
    ...groups.map(g => g.name),
    ...tasks.map(t => t.group_label).filter(Boolean),
  ])) as string[]).sort((a, b) => (_groupCreatedAt[b] ?? 0) - (_groupCreatedAt[a] ?? 0))
  const byGroup = groupFilter === 'all'
    ? tasks
    : groupFilter === '__none__'
      ? tasks.filter(t => !t.group_label)
      : tasks.filter(t => t.group_label === groupFilter)
  const shownTasks = byGroup.filter(t => {
    const statusOk = statusFilter === 'all' ? true
      : statusFilter === 'Delayed' ? isDelayed(t)
        : statusFilter === 'Closed' ? isClosed(t)
          : statusFilter === 'Late' ? isLate(t)
            : t.status === statusFilter
    const sevOk = severityFilter === 'all' || t.severity === severityFilter
    return statusOk && sevOk
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 p-5 sm:p-8 pt-20 md:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            {statusFilter !== 'all' && (
              <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs mb-1.5 transition hover:opacity-80" style={FAINT}>
                <Icon name="arrowLeft" size={13} /> Back to dashboard
              </Link>
            )}
            <h1 className="text-2xl font-semibold" style={TEXT}>Tasks</h1>
            <p className="text-xs mt-1" style={FAINT}>Click a task to see recommendations{statusFilter !== 'all' ? ` · filtered: ${statusFilter}` : ''}</p>
          </div>
          {userRole === 'leader' && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setShowGroupForm(!showGroupForm); setShowForm(false) }}>
                <Icon name="users" size={16} /> Create group
              </Button>
              <Button onClick={() => { setShowForm(!showForm); setShowGroupForm(false) }}>
                <Icon name="plus" size={16} /> New task
              </Button>
            </div>
          )}
        </div>

        {/* Create group form — leader only */}
        {showGroupForm && userRole === 'leader' && (
          <Card tint="violet" className="p-5 mb-6 tm-fade-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.18)', color: 'var(--tm-violet)' }}>
                <Icon name="users" size={18} />
              </div>
              <div>
                <p className="text-sm font-medium" style={TEXT}>Create / assign group</p>
                <p className="text-xs" style={FAINT}>Name it (or reuse an existing group), pick a colour, and add tasks</p>
              </div>
            </div>

            <Input
              list="task-group-names"
              placeholder="Group name e.g. Test Group"
              value={groupForm.name}
              onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
              className="mb-4"
            />
            <datalist id="task-group-names">
              {groups.map(g => <option key={g.id} value={g.name} />)}
            </datalist>

            <p className="text-xs mb-2" style={MUTED}>Colour <span style={FAINT}>(used only when creating a new group)</span></p>
            <div className="flex gap-2 mb-4">
              {GROUP_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setGroupForm({ ...groupForm, color: c })}
                  style={{ backgroundColor: c, outline: groupForm.color === c ? '2px solid var(--tm-text)' : 'none', outlineOffset: 2 }}
                  className={`w-7 h-7 rounded-full transition ${groupForm.color === c ? 'scale-110' : ''}`}
                  aria-label={c} />
              ))}
            </div>

            <p className="text-xs mb-2" style={MUTED}>Add tasks ({groupForm.members.length} selected)</p>
            <div className="flex flex-col gap-1 mb-4 max-h-56 overflow-y-auto">
              {tasks.length === 0 ? (
                <p className="text-xs" style={FAINT}>No tasks yet — create a task first.</p>
              ) : tasks.map(t => {
                const checked = groupForm.members.includes(t.id)
                return (
                  <button key={t.id} type="button" aria-pressed={checked}
                    onClick={() => setGroupForm(prev => ({
                      ...prev,
                      members: checked ? prev.members.filter(id => id !== t.id) : [...prev.members, t.id],
                    }))}
                    className="tm-pick">
                    <span className="w-4 h-4 rounded border shrink-0 flex items-center justify-center"
                      style={checked ? { background: 'var(--tm-indigo)', borderColor: 'var(--tm-indigo)', color: '#fff' } : { borderColor: 'var(--tm-border-strong)' }}>
                      {checked && <Icon name="check" size={11} strokeWidth={3} />}
                    </span>
                    {t.description} <span style={FAINT}>· {statusLabel(t.status)}</span>
                    {t.group_label && <span className="ml-auto" style={FAINT}>now: {t.group_label}</span>}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-3">
              <Button onClick={createGroup}>
                <Icon name="check" size={16} /> Save group
              </Button>
              <Button variant="ghost" onClick={() => { setShowGroupForm(false); setGroupForm({ name: '', color: GROUP_COLORS[0], members: [] }) }}>
                Cancel
              </Button>
            </div>
          </Card>
        )}

        {/* Create task form */}
        {showForm && userRole === 'leader' && (
          <Card className="p-5 mb-6 tm-fade-up">
            <p className="text-sm font-medium mb-4" style={TEXT}>New task</p>
            <div className="flex flex-col gap-3 mb-4">
              <Field label="Description">
                <Input
                  placeholder="e.g. Build login page"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Severity">
                  <select
                    value={form.severity}
                    onChange={e => setForm({ ...form, severity: e.target.value })}
                    className="tm-input"
                    style={form.severity ? undefined : FAINT}>
                    <option value="" disabled hidden>Severity</option>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Committed hours">
                  <Input
                    placeholder="e.g. 8"
                    value={form.committed_hours}
                    onChange={e => setForm({ ...form, committed_hours: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Start date">
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })}
                    style={form.start_date ? undefined : FAINT}
                  />
                </Field>
                <Field label="Due date">
                  <Input
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })}
                    style={form.due_date ? undefined : FAINT}
                  />
                </Field>
              </div>
              <Field label="Group / team">
                <Input
                  list="task-groups"
                  placeholder="Type new or pick existing"
                  value={form.group_label}
                  onChange={e => setForm({ ...form, group_label: e.target.value })}
                />
                <datalist id="task-groups">
                  {existingGroups.map(g => <option key={g} value={g} />)}
                </datalist>
              </Field>
            </div>

            <p className="text-xs mb-2" style={MUTED}>Required skills <span style={FAINT}>— click a skill, then set the minimum B / I / A</span></p>
            <div className="mb-4">
              <SkillPicker skills={skills} value={taskSkills} onChange={setTaskSkills} field="min_proficiency" labels={['Min: Beginner', 'Min: Intermediate', 'Min: Advanced']} />
            </div>

            <div className="flex gap-3">
              <Button onClick={createTask}>Create task</Button>
              <Button variant="ghost" onClick={() => { setShowForm(false); setTaskSkills([]) }}>Cancel</Button>
              <Button variant="ghost" className="ml-auto"
                onClick={() => { setForm({ description: '', committed_hours: '', severity: '', start_date: '', due_date: '', group_label: '' }); setTaskSkills([]) }}>
                Clear all
              </Button>
            </div>
          </Card>
        )}

        {/* Status + Group filters */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={FAINT}>Status</span>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="tm-select-sm">
              <option value="all">All</option>
              <option value="New">New</option>
              <option value="In Progress">Ongoing</option>
              <option value="Completed">Completed</option>
              <option value="Late">Completed · Late</option>
              <option value="Delayed">Delayed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={FAINT}>Severity</span>
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="tm-select-sm">
              <option value="all">All</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="hidden sm:block w-px h-5" style={{ background: 'var(--tm-border)' }} />
          <div className="flex items-center gap-2">
            <span className="text-xs" style={FAINT}>Group</span>
            {groupFilter !== 'all' && groupFilter !== '__none__' && (
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: groupColor(groupFilter) }} />
            )}
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="tm-select-sm max-w-[14rem]">
              <option value="all">All groups</option>
              {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
              <option value="__none__">No group</option>
            </select>
          </div>
        </div>

        {/* Tasks list */}
        <div className="flex flex-col gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : shownTasks.length === 0 ? (
            <Card>
              <EmptyState icon={<Icon name="list" size={28} />}
                title={tasks.length === 0 ? 'No tasks yet' : 'No tasks match these filters'}
                hint={tasks.length === 0 ? (userRole === 'leader' ? 'Create the first task to start matching students.' : 'Your leader hasn’t created any tasks yet.') : 'Try a different status, severity or group.'} />
            </Card>
          ) : (
            shownTasks.map(task => (
              <Card key={task.id} hover={expandedTask !== task.id && taskMenuOpen !== task.id}
                className={taskMenuOpen === task.id ? 'relative z-30' : 'overflow-hidden'}
                style={taskMenuOpen === task.id ? MENU_HOST : undefined}>
                <div
                  className="flex flex-wrap md:flex-nowrap items-center gap-x-3.5 gap-y-2 p-4 cursor-pointer"
                  onClick={() => loadRecommendations(task.id)}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: severityDot(task.severity) }} title={`${task.severity || 'Low'} severity`} />
                  <div className="flex-1 md:flex-none md:w-64 shrink-0 min-w-0">
                    <div className="flex items-center gap-2">
                      {task.group_label && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: groupColor(task.group_label) }} title={task.group_label} />}
                      <Link href={`/tasks/${task.id}`} onClick={e => e.stopPropagation()} className="text-sm font-medium hover:underline truncate" style={TEXT} title="Open task">{task.description}</Link>
                    </div>
                    <p className="text-xs truncate mt-0.5 flex items-center gap-1" style={FAINT}>
                      <Icon name="clock" size={12} />
                      {task.committed_hours != null ? `${task.committed_hours}h committed` : 'no hours set'}
                      {(task.start_date || task.due_date) && <> · {task.start_date || '…'} → {task.due_date || '…'}</>}
                    </p>
                  </div>

                  {/* Middle column — required skills as quiet chips (fills the row) */}
                  <div className="order-last md:order-none basis-full md:basis-auto flex-1 min-w-0 flex items-center gap-1.5 flex-wrap pl-5 md:pl-0">
                    {task.task_skills?.length > 0 ? (
                      <>
                        {task.task_skills.slice(0, 4).map((ts: any) => (
                          <span key={ts.skill_id} className="tm-chip">{ts.skills?.skill_name}</span>
                        ))}
                        {task.task_skills.length > 4 && <span className="text-[11px]" style={FAINT}>+{task.task_skills.length - 4}</span>}
                      </>
                    ) : <span className="text-xs" style={FAINT}>No skills required</span>}
                  </div>

                  {/* Status + SLA flags — own line on phones, inline on wider screens */}
                  <div className="order-last md:order-none basis-full md:basis-auto flex items-center gap-3.5 shrink-0 pl-5 md:pl-0">
                    <div className="flex items-center gap-1.5" title={`Status: ${task.status}`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDot(task.status) }} />
                      <span className="text-xs" style={MUTED}>{statusLabel(task.status)}</span>
                    </div>
                    {isLate(task) && <Badge accent="amber" className="!text-[11px] !py-0.5"><span title={`Delivered after due ${task.due_date}`}>late</span></Badge>}
                    {isDelayed(task) && <Badge accent="rose" className="!text-[11px] !py-0.5"><span title={`Past due ${task.due_date}`}>delayed</span></Badge>}
                    {isClosed(task) && <span className="tm-chip !text-[11px]" title={`Auto-closed — overdue more than ${GRACE_DAYS} days`}>closed</span>}
                  </div>

                  {userRole === 'leader' && (
                    <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setTaskMenuOpen(taskMenuOpen === task.id ? null : task.id)}
                        aria-label="Task actions" className="tm-btn tm-btn-ghost tm-btn-icon !border-transparent">
                        <Icon name="more" size={18} />
                      </button>
                      {taskMenuOpen === task.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setTaskMenuOpen(null)} />
                          <div className="tm-menu absolute right-0 top-full mt-1 z-20 w-44">
                            <p className="px-2.5 pt-1 pb-1 text-[10px] tracking-wide" style={FAINT}>SET STATUS</p>
                            {['New', 'In Progress', 'Completed'].map(st => (
                              <button key={st} disabled={isClosed(task)} onClick={() => { setTaskMenuOpen(null); updateTaskStatus(task.id, st) }}
                                className="tm-menu-item">
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDot(st) }} />
                                {statusLabel(st)}
                                {task.status === st && <Icon name="check" size={13} className="ml-auto" />}
                              </button>
                            ))}
                            <div className="my-1 h-px" style={{ background: 'var(--tm-border)' }} />
                            <button onClick={() => { setTaskMenuOpen(null); deleteTask(task.id, task.description) }}
                              className="tm-menu-item" style={{ color: 'var(--tm-rose)' }}>
                              <Icon name="trash" size={13} /> Delete task
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <span className="shrink-0 transition-transform" style={{ ...FAINT, transform: expandedTask === task.id ? 'rotate(180deg)' : undefined }}>
                    <Icon name="chevronDown" size={16} />
                  </span>
                </div>

                {/* Expanded panel: assigned team + (for open tasks) recommendations */}
                {expandedTask === task.id && (
                  <div className="p-4" style={{ borderTop: '1px solid var(--tm-border)' }}>
                    {/* Who's actually on it — shown once the task has started */}
                    <p className="text-xs mb-2" style={MUTED}>Assigned team ({(taskAssignees[task.id] || []).length})</p>
                    {(taskAssignees[task.id] || []).length === 0 ? (
                      <p className="text-xs mb-4" style={FAINT}>No one assigned yet.</p>
                    ) : (
                      <div className="flex flex-col gap-2 mb-4">
                        {taskAssignees[task.id].map((a: any) => (
                          <div key={a.id} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: 'var(--tm-surface-1)' }}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={AVATAR}>{initials(a.students?.name)}</div>
                            <span className="flex-1 text-sm" style={TEXT}>{a.students?.name}</span>
                            {a.score != null && <span className="text-xs" style={FAINT}>score {a.score}</span>}
                            <Badge accent={statusAccent(a.status)}>{a.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    {task.status === 'Completed' || isClosed(task) ? (
                      <p className="text-xs italic" style={FAINT}>{isClosed(task) ? 'Task closed — assignment locked.' : 'Task completed.'}</p>
                    ) : (
                    <>
                    <p className="text-xs mb-1" style={MUTED}>{task.status === 'New' ? 'Recommended students' : 'Recommended to add'}</p>
                    <p className="text-[11px] mb-3" style={FAINT}>Ranked by: meets all required skills first → best skill match → least busy (WIP), not by performance band. Already-assigned students are hidden; the rest continue on the next page.</p>
                    {!recommendations[task.id] ? (
                      <div className="flex flex-col gap-2">
                        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ height: 56 }} />)}
                      </div>
                    ) : (() => {
                      const assignedIds = new Set((taskAssignees[task.id] || []).map((a: any) => a.student_id))
                      const list = recommendations[task.id].filter((r: any) => !assignedIds.has(r.student_id))
                      const meta = recMeta[task.id]
                      if (list.length === 0) return <p className="text-xs" style={FAINT}>No more students to add.</p>
                      const page = recPage[task.id] || 0
                      const pageCount = Math.ceil(list.length / PAGE_SIZE)
                      const start = page * PAGE_SIZE
                      const pageItems = list.slice(start, start + PAGE_SIZE)
                      return (
                        <>
                          {meta?.suggested_pair && (
                            <Card tint="indigo" className="mb-3 p-3 !rounded-lg">
                              <p className="text-xs font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--tm-indigo)' }}>
                                <Icon name="scale" size={14} /> Suggested balanced pair
                              </p>
                              <p className="text-xs" style={MUTED}>{meta.suggested_pair.reason}</p>
                            </Card>
                          )}
                          {meta && meta.assigned_count < 2 && (
                            <Card tint="amber" className="mb-3 px-3 py-2 !rounded-lg">
                              <p className="text-xs flex items-center gap-1.5" style={TEXT}>
                                <span style={{ color: 'var(--tm-amber)' }}><Icon name="alert" size={14} /></span>
                                This task has {meta.assigned_count} assignee{meta.assigned_count === 1 ? '' : 's'} — assign at least 2 people.
                              </p>
                            </Card>
                          )}
                          <div className="flex flex-col gap-2">
                            {pageItems.map((r: any) => (
                              <div key={r.student_id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: 'var(--tm-surface-1)' }}>
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                                  style={r.qualified ? AVATAR : { background: 'var(--tm-surface-2)', ...FAINT }}>
                                  {initials(r.name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm flex items-center gap-2 flex-wrap" style={TEXT}>
                                    {r.name}
                                    {bandChip(r.band, r.avg_score)}
                                    {!r.qualified && (
                                      <Badge accent="rose">{r.over_wip ? 'WIP full' : 'Skills below min'}</Badge>
                                    )}
                                  </p>
                                  <p className="text-xs" style={FAINT}>
                                    Skill match {r.match_score}/3 · {r.met_count}/{r.total_required} skills ·{' '}
                                    <span style={{ color: r.wip >= 2 ? 'var(--tm-amber)' : 'var(--tm-emerald)' }}>WIP {r.wip}/3</span>
                                  </p>
                                  <p className="text-xs mt-0.5 italic" style={FAINT}>{r.justification}</p>
                                </div>
                                {userRole === 'leader' && (
                                  <Button variant="ghost" className="tm-btn-sm shrink-0"
                                    onClick={() => assignStudent(task.id, r.student_id, r.name)}
                                    disabled={r.over_wip || isClosed(task) || assigning === r.student_id}>
                                    {assigning === r.student_id ? 'Assigning…' : <><Icon name="plus" size={14} /> Assign</>}
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          {pageCount > 1 && (
                            <div className="flex items-center justify-between mt-3">
                              <span className="text-xs" style={FAINT}>
                                {start + 1}–{Math.min(start + PAGE_SIZE, list.length)} of {list.length}
                              </span>
                              <div className="flex gap-2">
                                <Button variant="ghost" className="tm-btn-sm"
                                  onClick={() => setRecPage(prev => ({ ...prev, [task.id]: page - 1 }))}
                                  disabled={page === 0}>
                                  <Icon name="arrowLeft" size={13} /> Prev
                                </Button>
                                <Button variant="ghost" className="tm-btn-sm"
                                  onClick={() => setRecPage(prev => ({ ...prev, [task.id]: page + 1 }))}
                                  disabled={page >= pageCount - 1}>
                                  Next <Icon name="arrowRight" size={13} />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                    </>
                    )}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  )
}
