'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, API, authHeaders } from '../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import { toast } from '../lib/ui'
import { effectiveRole } from '../lib/role'
import { Card, Badge, Button, Icon, Skeleton, EmptyState } from '../components/ui'

// Theme-token text colours, so copy flips correctly between dark and light.
const TEXT = { color: 'var(--tm-text)' }
const MUTED = { color: 'var(--tm-text-muted)' }
const FAINT = { color: 'var(--tm-text-faint)' }
const ROW = { background: 'var(--tm-surface-1)' }

export default function MyTasks() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('')
  const [student, setStudent] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [tab, setTab] = useState<'active' | 'completed'>('active')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [now, setNow] = useState(0)
  const [showTimers, setShowTimers] = useState(true)   // the elapsed-time box can be shown/hidden
  const [teamTasks, setTeamTasks] = useState<any[]>([])

  useEffect(() => { init() }, [])
  // live clock for the running timers
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  // remember the show/hide-timers preference across visits
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('tm_show_timers') : null
    if (saved !== null) setShowTimers(saved === '1')
  }, [])
  const toggleTimers = () => setShowTimers(v => {
    const nv = !v
    try { localStorage.setItem('tm_show_timers', nv ? '1' : '0') } catch { /* private mode */ }
    return nv
  })

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
    await load(s.id)
    await loadTeam(s.group_label, s.id)
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
      .select('student_id, status, tasks(description, due_date)')
      .in('student_id', ids)
      .in('status', ['Assigned', 'In Progress'])
    const rows = (data || [])
      .filter((a: any) => a.tasks)
      .map((a: any) => ({ name: nameById[a.student_id], description: a.tasks.description, due_date: a.tasks.due_date, status: a.status }))
      .sort((x: any, y: any) => (x.due_date || '9999-12-31').localeCompare(y.due_date || '9999-12-31'))
    setTeamTasks(rows)
  }

  const load = async (sid: string) => {
    const { data } = await supabase
      .from('assignments')
      .select('*, tasks(id, description, status, severity, due_date, committed_hours)')
      .eq('student_id', sid)
      .order('assigned_date', { ascending: false })
    setAssignments(data || [])
  }

  const startTask = async (assignmentId: string) => {
    setBusy(assignmentId)
    try {
      await axios.post(`${API}/start`, { assignment_id: assignmentId }, { headers: await authHeaders() })
      if (student) await load(student.id)
    } catch (err: any) { toast(errMsg(err, 'Could not start'), 'error') }
    finally { setBusy(null) }
  }

  const completeTask = async (assignmentId: string, desc: string) => {
    const input = prompt(
      `Complete "${desc}".\n\nHours actually spent (optional — leave blank to use the timer):`
    )
    if (input === null) return
    const trimmed = input.trim()
    const actual_hours = trimmed === '' ? undefined : parseFloat(trimmed)
    if (actual_hours !== undefined && (isNaN(actual_hours) || actual_hours < 0)) { toast('Enter a valid number of hours.', 'error'); return }
    setBusy(assignmentId)
    try {
      const res = await axios.post(`${API}/complete`, { assignment_id: assignmentId, actual_hours }, { headers: await authHeaders() })
      const d = res.data
      const basis = d.score != null && d.committed_hours != null ? ` — score ${d.score} (${d.committed_hours}h committed vs ${d.elapsed_hours}h actual)` : (d.score != null ? ` — score ${d.score}` : '')
      toast(`Completed!${userRole === 'leader' ? basis : ''}`, 'success')
      if (student) await load(student.id)
    } catch (err: any) { toast(errMsg(err, 'Could not complete'), 'error') }
    finally { setBusy(null) }
  }

  const severityDot = (s: string) => s === 'Critical' ? 'var(--tm-rose)' : s === 'Medium' ? 'var(--tm-amber)' : 'var(--tm-text-faint)'

  const elapsed = (startIso: string) => {
    if (!startIso) return '0h 0m 0s'
    const secs = Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000))
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
    return `${h}h ${m}m ${s}s`
  }

  const active = assignments.filter(a => a.status === 'Assigned' || a.status === 'In Progress')
  const completed = assignments.filter(a => a.status === 'Completed')

  const tabBtn = (key: 'active' | 'completed', label: string) => (
    <button onClick={() => setTab(key)} aria-pressed={tab === key} className="tm-pick !py-2 !px-4">
      {label}
    </button>
  )

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 p-5 sm:p-8 pt-20 md:pt-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold" style={TEXT}>My Tasks</h1>
          <p className="text-xs mt-1" style={FAINT}>Start a task to run its timer, then mark it complete when you&apos;re done.</p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ height: 76 }} />)}
          </div>
        ) : notFound ? (
          <Card tint="amber" className="p-5 max-w-lg">
            <p className="text-sm font-medium mb-1 flex items-center gap-2" style={TEXT}>
              <span style={{ color: 'var(--tm-amber)' }}><Icon name="alert" size={16} /></span>
              No student record linked to your account
            </p>
            <p className="text-xs" style={MUTED}>Ask your leader to add you on the Students page using <span className="font-medium" style={TEXT}>{userEmail}</span>, then refresh.</p>
          </Card>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-4 items-center">
              {tabBtn('active', `To do (${active.length})`)}
              {tabBtn('completed', `Completed (${completed.length})`)}
              {tab === 'active' && active.some(a => a.status === 'In Progress') && (
                <Button variant="ghost" className="tm-btn-sm ml-auto" onClick={toggleTimers}>
                  <Icon name="clock" size={13} /> {showTimers ? 'Hide timers' : 'Show timers'}
                </Button>
              )}
            </div>

            {tab === 'active' ? (
              active.length === 0 ? (
                <Card>
                  <EmptyState icon={<Icon name="check" size={28} />} title="Nothing assigned to you right now"
                    hint="Pick up a suggested task from your Profile, or wait for your leader to assign one." />
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {active.map(a => (
                    <Card key={a.id} className="p-4 flex flex-wrap items-center gap-4">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: severityDot(a.tasks?.severity) }} title={`${a.tasks?.severity || 'Low'} severity`} />
                      <div className="flex-1 min-w-0">
                        <Link href={`/tasks/${a.tasks?.id}`} className="text-sm font-medium hover:underline" style={TEXT}>{a.tasks?.description || '(task removed)'}</Link>
                        <p className="text-xs mt-1 flex flex-wrap items-center gap-x-1.5" style={FAINT}>
                          {a.tasks?.severity && <span>{a.tasks.severity}</span>}
                          {a.tasks?.committed_hours != null && <span>· {a.tasks.committed_hours}h budget</span>}
                          {a.tasks?.due_date && <span>· due {a.tasks.due_date}</span>}
                        </p>
                      </div>

                      {a.status === 'Assigned' ? (
                        <div className="flex items-center gap-3">
                          <Badge accent="amber">Ready to start</Badge>
                          <Button className="tm-btn-sm" onClick={() => startTask(a.id)} disabled={busy === a.id}>
                            {busy === a.id ? '…' : <><Icon name="arrowRight" size={13} /> Start</>}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          {showTimers ? (
                            <Card tint="emerald" className="px-3 py-1.5 !rounded-lg text-right min-w-[7.5rem]">
                              <p className="text-lg font-mono font-semibold tabular-nums leading-none" style={{ color: 'var(--tm-emerald)' }}>{elapsed(a.in_progress_at)}</p>
                              <p className="text-[10px] mt-1" style={FAINT}>elapsed · running</p>
                            </Card>
                          ) : (
                            <Badge accent="emerald">running</Badge>
                          )}
                          <Button variant="ghost" className="tm-btn-sm" style={{ color: 'var(--tm-emerald)' }}
                            onClick={() => completeTask(a.id, a.tasks?.description || 'this task')} disabled={busy === a.id}>
                            {busy === a.id ? '…' : <><Icon name="check" size={13} /> Complete</>}
                          </Button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )
            ) : (
              completed.length === 0 ? (
                <Card>
                  <EmptyState icon={<Icon name="check" size={28} />} title="No completed tasks yet" />
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {completed.map(a => (
                    <Card key={a.id} className="p-3.5 flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(56,189,248,0.16)', color: 'var(--tm-sky)' }}>
                        <Icon name="check" size={13} strokeWidth={2.4} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <Link href={`/tasks/${a.tasks?.id}`} className="text-sm hover:underline" style={TEXT}>{a.tasks?.description || '(task removed)'}</Link>
                        <p className="text-xs" style={FAINT}>
                          {a.completed_at ? `Completed ${new Date(a.completed_at).toLocaleDateString()}` : 'Completed'}
                          {a.actual_hours != null ? ` · ${Math.round(a.actual_hours * 10) / 10}h declared` : ''}
                          {userRole === 'leader' && a.timed_hours != null ? ` · ${Math.round(a.timed_hours * 10) / 10}h timed` : ''}
                        </p>
                      </div>
                      {/* scores hidden from students */}
                      {userRole === 'leader' && a.score != null && <span className="tm-chip">score {a.score}</span>}
                    </Card>
                  ))}
                </div>
              )
            )}

            {student?.group_label && teamTasks.length > 0 && (
              <Card className="p-5 mt-6">
                <p className="text-sm font-medium mb-1 flex items-center gap-2" style={TEXT}>
                  <Icon name="users" size={16} /> Team deadlines
                </p>
                <p className="text-xs mb-4" style={FAINT}>Active tasks across your group ({student.group_label}), soonest first — plan around them.</p>
                <div className="flex flex-col gap-2">
                  {teamTasks.map((t, i) => {
                    const overdue = t.due_date && t.due_date < new Date().toISOString().slice(0, 10)
                    return (
                      <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 rounded-lg p-2.5" style={ROW}>
                        <span className="text-xs w-28 truncate shrink-0" style={MUTED}>{t.name}</span>
                        <span className="flex-1 text-sm truncate min-w-0" style={TEXT}>{t.description}</span>
                        <span className="tm-chip !text-[11px] shrink-0">{t.status === 'In Progress' ? 'Ongoing' : t.status}</span>
                        <span className="text-xs tabular-nums whitespace-nowrap sm:w-40 sm:text-right shrink-0" style={{ color: overdue ? 'var(--tm-rose)' : 'var(--tm-text-faint)' }}>
                          {t.due_date ? `${overdue ? 'overdue · ' : 'due '}${t.due_date}` : 'no due date'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}
