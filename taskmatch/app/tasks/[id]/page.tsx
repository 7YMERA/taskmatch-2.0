'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, API, authHeaders } from '../../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import { logActivity } from '../../lib/log'
import Sidebar from '../../components/Sidebar'
import { FitRing, FitSummary } from '../../components/FitScore'
import ProjectChip from '../../components/ProjectChip'
import type { Project } from '../../lib/projects'
import { toast, confirmDialog, promptDialog } from '../../lib/ui'
import { effectiveRole, can, roleLabel } from '../../lib/role'
import { Card, Badge, Button, Input, Icon, Skeleton, SkeletonCard, EmptyState, bandAccent } from '../../components/ui'

const PROFICIENCY = ['', 'Beginner', 'Intermediate', 'Advanced']

// Assignment modes: the server picks one qualified person; every pick comes with its reason.
type Mode = 'best_match' | 'round_robin' | 'least_loaded'
const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'best_match', label: 'Best match', hint: 'Top of the ranked list: the highest fit score among people who meet every skill.' },
  { key: 'round_robin', label: 'Round robin', hint: 'Takes turns: whoever has gone longest without a new task.' },
  { key: 'least_loaded', label: 'Least loaded', hint: 'Fewest committed hours on their active tasks.' },
]

// Theme-token text colours, so copy flips correctly between dark and light.
const TEXT = { color: 'var(--tm-text)' }
const MUTED = { color: 'var(--tm-text-muted)' }
const FAINT = { color: 'var(--tm-text-faint)' }
const AVATAR = { background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }
const ROW = { background: 'var(--tm-surface-1)' }

export default function TaskDetail() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('')
  const [task, setTask] = useState<any>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [assignees, setAssignees] = useState<any[]>([])
  const [recs, setRecs] = useState<any[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('best_match')
  const [pick, setPick] = useState<{ student_id: string | null; name: string | null; reason: string } | null>(null)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')
      setUserRole(effectiveRole(session))
    })
    loadAll()
  }, [id])

  // Attach the caller's Supabase access token so the API can verify who is acting.
  // The server derives actor identity + permissions from this token — never from

  const loadAll = async () => {
    const { data: t } = await supabase
      .from('tasks')
      .select('*, task_skills(skill_id, min_proficiency, skills(skill_name))')
      .eq('id', id).single()
    setTask(t)
    if (t?.project_id) supabase.from('projects').select('*').eq('id', t.project_id).maybeSingle().then(({ data }) => setProject(data))
    await Promise.all([loadAssignees(), loadComments(), loadRecs()])
    setLoading(false)
  }

  const loadAssignees = async () => {
    const { data } = await supabase
      .from('assignments')
      .select('*, students(name, matric)')
      .eq('task_id', id)
    setAssignees(data || [])
  }

  const loadComments = async () => {
    const { data } = await supabase
      .from('task_comments').select('*').eq('task_id', id)
      .order('created_at', { ascending: true })
    setComments(data || [])
  }

  const loadRecs = async () => {
    try {
      const res = await axios.get(`${API}/recommend/${id}`, { headers: await authHeaders() })
      setRecs(res.data.recommendations)
      setMeta({ suggested_pair: res.data.suggested_pair, assigned_count: res.data.assigned_count, wip_limit: res.data.wip_limit ?? 3 })
    } catch { setRecs([]) }
  }

  const refresh = async () => {
    const { data: t } = await supabase.from('tasks')
      .select('*, task_skills(skill_id, min_proficiency, skills(skill_name))').eq('id', id).single()
    setTask(t)
    await Promise.all([loadAssignees(), loadRecs()])
  }

  // Turn an axios error into a message that names the real reason instead of a bare "Failed"
  // (e.g. a closed task, or the server being unreachable).
  const errMsg = (err: any, fallback: string) => {
    const detail = err?.response?.data?.detail
    if (detail) return detail
    if (err?.response) return `${fallback} (server responded ${err.response.status})`
    return `${fallback} — couldn't reach the server. Check your connection and try again.`
  }

  const assignStudent = async (student_id: string, name: string) => {
    if (assigning) return
    setAssigning(student_id)
    try {
      await axios.post(`${API}/assign`, { task_id: id, student_id }, { headers: await authHeaders() })
      await refresh()
      toast(`${name} assigned!`, 'success')
    } catch (err: any) { toast(errMsg(err, 'Could not assign'), 'error') } finally { setAssigning(null) }
  }

  // Preview who the chosen mode would pick, without assigning anyone yet.
  const previewPick = async (m: Mode) => {
    setMode(m)
    setPicking(true)
    try {
      const res = await axios.post(`${API}/auto-assign`, { task_id: id, mode: m, dry_run: true }, { headers: await authHeaders() })
      setPick(res.data)
    } catch (err: any) { setPick(null); toast(errMsg(err, 'Could not preview a pick'), 'error') } finally { setPicking(false) }
  }

  const autoAssign = async () => {
    if (assigning) return
    setAssigning('auto')
    try {
      const res = await axios.post(`${API}/auto-assign`, { task_id: id, mode }, { headers: await authHeaders() })
      if (!res.data.student_id) { toast(res.data.reason, 'info'); return }
      toast(`${res.data.name} assigned (${res.data.mode_label})`, 'success')
      await refresh()
      previewPick(mode)
    } catch (err: any) { toast(errMsg(err, 'Could not assign'), 'error') } finally { setAssigning(null) }
  }

  const removeAssignee = async (assignmentId: string, name: string, status: string) => {
    if (status === 'Completed') { toast("This assignment is completed — it's kept as the student's performance record and can't be removed.", 'info'); return }
    if (!(await confirmDialog({ title: `Remove ${name} from this task?`, message: `They keep their profile and history; only this assignment is removed.${status === 'In Progress' ? ' Their running timer for this task will be discarded.' : ''}`, danger: true, confirmLabel: 'Remove' }))) return
    try {
      await axios.post(`${API}/unassign`, { assignment_id: assignmentId }, { headers: await authHeaders() })
      await refresh()
    } catch (err: any) { toast(errMsg(err, 'Could not remove'), 'error') }
  }

  const startAssignment = async (assignmentId: string) => {
    try {
      await axios.post(`${API}/start`, { assignment_id: assignmentId }, { headers: await authHeaders() })
      await refresh()
    } catch (err: any) { toast(errMsg(err, 'Could not start'), 'error') }
  }

  const completeAssignment = async (assignmentId: string, name: string) => {
    const input = await promptDialog({ title: `Mark ${name}'s work complete`, message: 'How many hours were actually spent? Leave blank to use the tracked time.', label: 'Actual hours (optional)', placeholder: 'e.g. 4.5', inputMode: 'decimal', confirmLabel: 'Mark complete' })
    if (input === null) return
    const trimmed = input.trim()
    const actual_hours = trimmed === '' ? undefined : parseFloat(trimmed)
    if (actual_hours !== undefined && (isNaN(actual_hours) || actual_hours < 0)) { toast('Enter a valid number.', 'error'); return }
    try {
      const res = await axios.post(`${API}/complete`, { assignment_id: assignmentId, actual_hours }, { headers: await authHeaders() })
      toast(res.data.score != null && res.data.committed_hours != null
        ? `Completed! Score ${res.data.score} (${res.data.committed_hours}h committed vs ${res.data.elapsed_hours}h actual)`
        : `Completed! Score: ${res.data.score ?? 'n/a'}`, 'success')
      await refresh()
    } catch (err: any) { toast(errMsg(err, 'Could not complete'), 'error') }
  }

  const addComment = async () => {
    const body = newComment.trim()
    if (!body) return
    const { data, error } = await supabase.from('task_comments')
      .insert({ task_id: id, author_email: userEmail, author_role: userRole, body })
      .select().single()
    if (error) return toast(error.message, 'error')
    await logActivity({
      action: 'comment.added', entity_type: 'comment', entity_id: data.id,
      summary: `${userEmail} commented on '${task?.description || 'a task'}'`,
      details: { task_id: id, body },
    })
    setNewComment('')
    loadComments()
  }

  // Status / severity → design-system accents (same colours as the Tasks list).
  const statusAccent = (s: string) =>
    s === 'New' ? 'amber' as const
      : s === 'In Progress' || s === 'Assigned' ? 'emerald' as const
        : s === 'Completed' ? 'sky' as const
          : 'indigo' as const
  const statusLabel = (s: string) => s === 'In Progress' ? 'Ongoing' : s
  const severityDot = (s: string) => s === 'Critical' ? 'var(--tm-rose)' : s === 'Medium' ? 'var(--tm-amber)' : 'var(--tm-text-faint)'

  const GRACE_DAYS = 7
  const today = new Date().toISOString().slice(0, 10)
  const isClosed = (t: any) => t && t.status !== 'Completed' && t.due_date && Math.floor((Date.parse(today) - Date.parse(t.due_date)) / 86400000) > GRACE_DAYS
  const isDelayed = (t: any) => t && t.status !== 'Completed' && t.due_date && t.due_date < today && !isClosed(t)
  const isLate = (t: any) => t && t.status === 'Completed' && t.completed_at && t.completed_at.slice(0, 10) > t.due_date

  const bandChip = (band: string, avg: number | null) => {
    if (band === 'unrated') return <span className="tm-chip">unrated</span>
    return <Badge accent={bandAccent(band)}>{`${band} ${avg ?? ''}`.trim()}</Badge>
  }

  const initials = (n: string) => n?.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
  const assignedIds = new Set(assignees.map(a => a.student_id))

  // WIP badge: green with room, amber on the last slot, red when at/over the limit.
  const wipLimit = meta?.wip_limit ?? 3
  const wipChip = (wip: number) => {
    const accent = wip >= wipLimit ? 'rose' as const : wip >= wipLimit - 1 ? 'amber' as const : 'emerald' as const
    return <span title={`${wip} active task${wip === 1 ? '' : 's'} out of a limit of ${wipLimit}`}>
      <Badge accent={accent}>WIP {wip}/{wipLimit}</Badge>
    </span>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <Link href="/tasks" className="inline-flex items-center gap-1.5 text-xs hover:underline" style={FAINT}>
          <Icon name="arrowLeft" size={13} /> Back to tasks
        </Link>

        {loading ? (
          <div className="mt-4 flex flex-col gap-6">
            <Skeleton style={{ height: 96 }} />
            <div className="grid md:grid-cols-2 gap-6"><SkeletonCard /><SkeletonCard /></div>
          </div>
        ) : !task ? (
          <Card className="mt-4">
            <EmptyState icon={<Icon name="list" size={28} />} title="Task not found" hint="It may have been deleted." />
          </Card>
        ) : (
          <>
            {/* Header */}
            <Card className="p-5 mt-4 mb-6 tm-fade-up">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight" style={TEXT}>{task.description}</h1>
                  <div className="flex gap-2 mt-3 flex-wrap items-center">
                    {project && (
                      <Link href={`/tasks?project=${project.id}`} className="tm-chip gap-1.5 hover:underline" title="All tasks in this project">
                        <ProjectChip project={project} className="!px-1 !py-0" /> {project.name}
                      </Link>
                    )}
                    {task.severity && (
                      <span className="tm-chip gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: severityDot(task.severity) }} />
                        {task.severity}
                      </span>
                    )}
                    <Badge accent={statusAccent(task.status)}>{statusLabel(task.status)}</Badge>
                    {isLate(task) && <span title={`Delivered after due ${task.due_date}`}><Badge accent="amber">late</Badge></span>}
                    {isDelayed(task) && <span title={`SLA breached — past due ${task.due_date}`}><Badge accent="rose">delayed</Badge></span>}
                    {isClosed(task) && <span className="tm-chip" title={`Auto-closed — overdue more than ${GRACE_DAYS} days`}>closed</span>}
                  </div>
                  {task.task_skills?.length > 0 && (
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {task.task_skills.map((ts: any) => (
                        <span key={ts.skill_id} className="tm-chip">
                          {ts.skills?.skill_name}<span className="ml-1" style={FAINT}>· {PROFICIENCY[ts.min_proficiency]}+</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-xs flex flex-col items-end gap-1" style={FAINT}>
                  {task.committed_hours != null && <p className="flex items-center gap-1"><Icon name="clock" size={12} /> {task.committed_hours}h committed</p>}
                  {(task.start_date || task.due_date) && <p>{task.start_date || '…'} → {task.due_date || '…'}</p>}
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Assignees */}
              <Card className="p-5">
                <p className="text-sm font-medium mb-1" style={TEXT}>Team ({assignees.length})</p>
                {assignees.length < 2 && (
                  <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: 'var(--tm-amber)' }}>
                    <Icon name="alert" size={13} /> Tasks should have at least 2 people.
                  </p>
                )}
                {assignees.length === 0 ? (
                  <p className="text-xs" style={FAINT}>No one assigned yet.</p>
                ) : (
                  <div className="flex flex-col gap-2 mt-2">
                    {assignees.map(a => (
                      <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg p-3" style={ROW}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={AVATAR}>{initials(a.students?.name)}</div>
                        <div className="flex-1 min-w-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <Link href={`/people/${a.student_id}`} className="text-sm hover:underline" style={TEXT}>{a.students?.name}</Link>
                            {recs.length > 0 && wipChip(recs.find(r => r.student_id === a.student_id)?.wip ?? 0)}
                          </span>
                          <p className="text-xs mt-0.5" style={FAINT}>
                            {statusLabel(a.status)}
                            {a.score != null ? ` · score ${a.score}` : ''}
                            {a.actual_hours != null ? ` · ${Math.round(a.actual_hours * 10) / 10}h declared` : ''}
                            {can(userRole, 'insights.view') && a.timed_hours != null ? ` · ${Math.round(a.timed_hours * 10) / 10}h timed` : ''}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {a.status === 'Assigned' && !isClosed(task) && (
                            <Button variant="ghost" className="tm-btn-sm" onClick={() => startAssignment(a.id)}>
                              <Icon name="arrowRight" size={13} /> Start
                            </Button>
                          )}
                          {a.status === 'In Progress' && !isClosed(task) && (
                            <Button variant="ghost" className="tm-btn-sm" style={{ color: 'var(--tm-emerald)' }} onClick={() => completeAssignment(a.id, a.students?.name)}>
                              <Icon name="check" size={13} /> Complete
                            </Button>
                          )}
                          {can(userRole, 'assign.others') && a.status !== 'Completed' && (
                            <button onClick={() => removeAssignee(a.id, a.students?.name, a.status)} title="Remove from this task" aria-label="Remove from this task"
                              className="tm-btn tm-btn-ghost tm-btn-icon" style={{ color: 'var(--tm-rose)' }}>
                              <Icon name="trash" size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Recommendations */}
              <Card className="p-5">
                <p className="text-sm font-medium mb-1" style={TEXT}>Recommended</p>
                <p className="text-[11px] mb-3" style={FAINT}>Ranked by fit score out of 100: skills (45), proven experience on finished work (20), availability in slots and hours (20) and track record (15). People who meet every skill come first. Press Why? on anyone to see the parts.</p>
                {isClosed(task) && (
                  <div className="mb-3 rounded-lg p-3" style={{ ...ROW, border: '1px solid var(--tm-border)' }}>
                    <p className="text-xs flex items-start gap-1.5" style={MUTED}>
                      <span className="mt-px"><Icon name="lock" size={13} /></span>
                      This task is closed (SLA window expired), so assignments are disabled. This is about the task&apos;s deadline — not any student&apos;s skill level.
                    </p>
                  </div>
                )}
                {can(userRole, 'assign.others') && !isClosed(task) && (
                  <div className="mb-3 rounded-lg p-3" style={{ border: '1px solid var(--tm-border)' }}>
                    <p className="text-xs font-medium mb-2 flex items-center gap-1.5" style={TEXT}>
                      <Icon name="bolt" size={14} /> Auto-assign
                    </p>
                    <div className="tm-seg mb-2 max-w-full overflow-x-auto">
                      {MODES.map(m => (
                        <button key={m.key} onClick={() => previewPick(m.key)} aria-pressed={pick != null && mode === m.key} className="whitespace-nowrap">
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] mb-2" style={FAINT}>
                      {pick ? MODES.find(m => m.key === mode)?.hint : 'Choose a mode to see who it would pick. Nothing is assigned until you confirm.'}
                    </p>
                    {picking ? <Skeleton style={{ height: 40 }} />
                      : pick && (
                        <div className="flex flex-wrap items-center gap-3 rounded-lg p-2.5" style={ROW}>
                          {pick.student_id && <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={AVATAR}>{initials(pick.name || '')}</div>}
                          <div className="flex-1 min-w-0">
                            {pick.name && <p className="text-sm" style={TEXT}>{pick.name}</p>}
                            <p className="text-xs" style={FAINT}>{pick.reason}</p>
                          </div>
                          {pick.student_id && (
                            <Button className="tm-btn-sm shrink-0" onClick={autoAssign} disabled={assigning === 'auto'}>
                              {assigning === 'auto' ? 'Assigning…' : <>Assign {pick.name?.split(' ')[0]}</>}
                            </Button>
                          )}
                        </div>
                      )}
                  </div>
                )}
                {meta?.suggested_pair && (
                  <Card tint="indigo" className="mb-3 p-3 !rounded-lg">
                    <p className="text-xs font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--tm-primary-text)' }}>
                      <Icon name="scale" size={14} /> Suggested balanced pair
                    </p>
                    <p className="text-xs" style={MUTED}>{meta.suggested_pair.reason}</p>
                  </Card>
                )}
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                  {recs.filter(r => !assignedIds.has(r.student_id)).map(r => (
                    <div key={r.student_id} className="flex items-center gap-3 rounded-lg p-3" style={ROW}>
                      {r.fit_score != null ? <FitRing score={r.fit_score} size={36} /> : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                          style={r.qualified ? AVATAR : { background: 'var(--tm-surface-2)', ...FAINT }}>
                          {initials(r.name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm flex items-center gap-2 flex-wrap" style={TEXT}>
                          {r.name}
                          {bandChip(r.band, r.avg_score)}
                          {wipChip(r.wip)}
                          {r.away && <Badge accent="amber">away until {r.away_until}</Badge>}
                          {!r.qualified && !r.over_wip && !r.away && <span title="Below the required skill level — can still be assigned as a growth pairing"><Badge accent="rose">below min</Badge></span>}
                        </p>
                        <p className="text-xs italic mt-0.5" style={FAINT}>{r.justification}</p>
                        {r.fit_factors && <div className="mt-1.5"><FitSummary score={r.fit_score} factors={r.fit_factors} /></div>}
                      </div>
                      {can(userRole, 'assign.others') && (
                        <Button variant="ghost" className="tm-btn-sm shrink-0"
                          onClick={() => assignStudent(r.student_id, r.name)}
                          disabled={r.over_wip || isClosed(task) || assigning === r.student_id}>
                          {assigning === r.student_id ? 'Assigning…' : <><Icon name="plus" size={14} /> Assign</>}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Comments */}
            <Card className="p-5 mt-6">
              <p className="text-sm font-medium mb-4" style={TEXT}>Comments ({comments.length})</p>
              <div className="flex flex-col gap-3 mb-4">
                {comments.length === 0 ? (
                  <p className="text-xs" style={FAINT}>No comments yet. Share progress or notes below.</p>
                ) : comments.map(c => (
                  <div key={c.id} className="rounded-lg p-3" style={ROW}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={MUTED}>{c.author_email}</span>
                      {c.author_role && <span className="tm-chip !text-[11px] !py-0">{roleLabel(c.author_role)}</span>}
                      <span className="text-xs ml-auto" style={FAINT}>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" style={TEXT}>{c.body}</p>
                  </div>
                ))}
              </div>
              {can(userRole, 'comment') ? <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addComment() }}
                  placeholder="Write a comment on progress…"
                  className="flex-1"
                />
                <Button onClick={addComment} disabled={!newComment.trim()}>Post</Button>
              </div> : <p className="text-xs" style={FAINT}>You have view-only access, so you can read comments but not post.</p>}
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
