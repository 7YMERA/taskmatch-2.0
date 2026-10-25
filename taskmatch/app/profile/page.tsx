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
import { toast, confirmDialog, promptDialog } from '../lib/ui'
import { Card, Badge, Button, Icon, Skeleton, SkeletonCard, bandAccent } from '../components/ui'

const PROFICIENCY = ['', 'Beginner', 'Intermediate', 'Advanced']

// Theme-token text colours, so copy flips correctly between dark and light.
const TEXT = { color: 'var(--tm-text)' }
const MUTED = { color: 'var(--tm-text-muted)' }
const FAINT = { color: 'var(--tm-text-faint)' }
const AVATAR = { background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }
const ROW = { background: 'var(--tm-surface-1)' }

export default function Profile() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string>('')
  const [userRole, setUserRole] = useState<string>('')
  const [student, setStudent] = useState<any>(null)
  const [skills, setSkills] = useState<any[]>([])
  const [mySkills, setMySkills] = useState<{ skill_id: string, proficiency: number }[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [recommended, setRecommended] = useState<{ qualified: any[], growth: any[] }>({ qualified: [], growth: [] })
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    setUserEmail(session.user.email || '')
    setUserRole(effectiveRole(session))

    const { data: skillData } = await supabase.from('skills').select('*')
    setSkills(skillData || [])

    // Link the logged-in account to a student record by email
    const { data: studentData } = await supabase
      .from('students')
      .select('*, student_skills(skill_id, proficiency, skills(skill_name))')
      .eq('email', session.user.email)
      .maybeSingle()

    if (!studentData) { setNotFound(true); setLoading(false); return }

    setStudent(studentData)
    setMySkills(
      (studentData.student_skills || []).map((ss: any) => ({
        skill_id: ss.skill_id,
        proficiency: ss.proficiency,
      }))
    )
    await loadTasks(studentData.id)
    setLoading(false)
  }

  const loadTasks = async (studentId: string) => {
    const { data: assignData } = await supabase
      .from('assignments')
      .select('*, tasks(id, description, status, estimated_days, due_date)')
      .eq('student_id', studentId)
      .order('assigned_date', { ascending: false })
    setAssignments(assignData || [])

    try {
      const res = await axios.get(`${API}/recommend-tasks/${studentId}`, { headers: await authHeaders() })
      setRecommended({ qualified: res.data.qualified || [], growth: res.data.growth || [] })
    } catch {
      setRecommended({ qualified: [], growth: [] })
    }
  }

  const completeAssignment = async (assignmentId: string, taskDesc: string) => {
    const input = await promptDialog({ title: 'Mark task complete', message: `"${taskDesc}"\nHow many hours did you actually spend? Leave blank to use the tracked time.`, label: 'Actual hours (optional)', placeholder: 'e.g. 4.5', inputMode: 'decimal', confirmLabel: 'Mark complete' })
    if (input === null) return // cancelled
    const trimmed = input.trim()
    const actual_hours = trimmed === '' ? undefined : parseFloat(trimmed)
    if (actual_hours !== undefined && (isNaN(actual_hours) || actual_hours < 0)) {
      toast('Enter a valid number of hours.', 'error')
      return
    }
    try {
      const res = await axios.post(`${API}/complete`, {
        assignment_id: assignmentId,
        actual_hours,
      }, { headers: await authHeaders() })
      toast(res.data.score != null && res.data.committed_hours != null
        ? `Completed! Score ${res.data.score} (${res.data.committed_hours}h committed vs ${res.data.elapsed_hours}h actual)`
        : `Completed! Your score: ${res.data.score ?? 'n/a'}`, 'success')
      if (student) await loadTasks(student.id)
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to complete', 'error')
    }
  }

  // Self-assign: the API resolves the student from this token, so it can only ever add
  // the task to the caller's own account.
  const pickTask = async (taskId: string, desc: string) => {
    if (!(await confirmDialog({ title: 'Pick up this task?', message: `"${desc}" will be added to your tasks — start its timer from My Tasks when you begin.`, confirmLabel: 'Pick it up' }))) return
    setPicking(taskId)
    try {
      const headers = await authHeaders()
      await axios.post(`${API}/self-assign`, { task_id: taskId }, { headers })
      if (student) await loadTasks(student.id)
      toast(`"${desc}" added to your tasks.`, 'success')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Could not pick up this task. The server may be waking up — try again.', 'error')
    } finally { setPicking(null) }
  }

  const uploadAvatar = async (file?: File) => {
    if (!file || !student) return
    setSaving(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${student.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' })
    if (upErr) { setSaving(false); toast(`Upload failed: ${upErr.message}`, 'error'); return }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('students').update({ avatar_url: pub.publicUrl }).eq('id', student.id)
    await logActivity({
      action: 'student.photo_updated', entity_type: 'student', entity_id: student.id,
      summary: `${student.name} updated their profile photo`,
    })
    const { data: refreshed } = await supabase
      .from('students')
      .select('*, student_skills(skill_id, proficiency, skills(skill_name))')
      .eq('id', student.id).single()
    setStudent(refreshed)
    setSaving(false)
  }

  const saveSkills = async () => {
    if (!student) return
    setSaving(true)
    await supabase.from('student_skills').delete().eq('student_id', student.id)
    if (mySkills.length > 0) {
      await supabase.from('student_skills').insert(
        mySkills.map(s => ({ student_id: student.id, skill_id: s.skill_id, proficiency: s.proficiency }))
      )
    }
    // Refresh student record (and re-run reverse matching, since skills changed)
    const { data: refreshed } = await supabase
      .from('students')
      .select('*, student_skills(skill_id, proficiency, skills(skill_name))')
      .eq('id', student.id)
      .single()
    setStudent(refreshed)
    await logActivity({
      action: 'student.skills_updated', entity_type: 'student', entity_id: student.id,
      summary: `${student.name} updated their own skills (${mySkills.length} skill${mySkills.length === 1 ? '' : 's'})`,
      details: { skills: mySkills, self: true },
    })
    await loadTasks(student.id)
    setEditing(false)
    setSaving(false)
  }

  const initials = (name: string) =>
    name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  const statusAccent = (s: string) =>
    s === 'New' ? 'amber' as const
      : s === 'In Progress' || s === 'Assigned' ? 'emerald' as const
        : s === 'Completed' ? 'sky' as const
          : 'indigo' as const
  const statusLabel = (s: string) => s === 'In Progress' ? 'Ongoing' : s

  // WIP = the student's own active assignments (Assigned or In Progress) — same definition the
  // matcher, /assign, /wip and the roster use. (Previously counted the TASK's status, which wrongly
  // included tasks the student had already completed but teammates hadn't.)
  const wip = assignments.filter(a => a.status === 'Assigned' || a.status === 'In Progress').length

  // My stats (computed locally — mirrors the per-student dashboard)
  const myDone = assignments.filter(a => a.status === 'Completed')
  const myActive = assignments.filter(a => a.status === 'In Progress')
  const myScored = myDone.filter(a => a.score != null)
  const myAvg = myScored.length ? (myScored.reduce((s, a) => s + a.score, 0) / myScored.length) : null
  const myBand = myAvg == null ? 'unrated' : myAvg >= 0.6 ? 'high' : myAvg >= 0.4 ? 'avg' : 'low'
  const myTimed = myDone.filter(a => a.actual_hours != null)
  const myAvgTime = myTimed.length ? (myTimed.reduce((s, a) => s + a.actual_hours, 0) / myTimed.length).toFixed(1) : '—'
  const myOnTime = myDone.filter(a => a.completed_at && a.tasks?.due_date && a.completed_at.slice(0, 10) <= a.tasks.due_date).length
  const myLate = myDone.length - myOnTime
  const bandColor = myBand === 'unrated' ? 'var(--tm-text-muted)' : `var(--tm-${bandAccent(myBand)})`

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <div className="mb-6">
          <h1 className="tm-page-title">My Profile</h1>
          <p className="text-xs mt-1" style={FAINT}>Your skills, workload and tasks picked for you</p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-6">
            <Skeleton style={{ height: 96 }} />
            <div className="grid md:grid-cols-2 gap-6"><SkeletonCard /><SkeletonCard /></div>
          </div>
        ) : notFound ? (
          <Card tint="amber" className="p-5 max-w-lg">
            <p className="text-sm font-medium mb-1 flex items-center gap-2" style={TEXT}>
              <span style={{ color: 'var(--tm-amber)' }}><Icon name="alert" size={16} /></span>
              No student record linked to your account
            </p>
            <p className="text-xs" style={MUTED}>
              Your login email (<span className="font-medium" style={TEXT}>{userEmail}</span>) doesn&apos;t match any
              student in the roster. Ask your team leader to add you on the Students page using this email,
              then refresh.
            </p>
          </Card>
        ) : (
          <>
            {/* Profile header */}
            <Card className="p-5 mb-6 tm-fade-up">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative shrink-0">
                  {student.avatar_url ? (
                    <img src={student.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold" style={AVATAR}>
                      {initials(student.name)}
                    </div>
                  )}
                  <label title="Change photo"
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer text-white transition hover:brightness-110"
                    style={{ background: 'var(--tm-gradient-btn)', border: '2px solid var(--tm-bg-elev)' }}>
                    <Icon name={saving ? 'clock' : 'upload'} size={13} strokeWidth={2.2} />
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => uploadAvatar(e.target.files && e.target.files[0] ? e.target.files[0] : undefined)} />
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold" style={TEXT}>{student.name}</p>
                  <p className="text-xs mt-0.5" style={FAINT}>
                    {student.matric} · {student.programme} · Year {student.year}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums" style={{ color: wip >= 3 ? 'var(--tm-amber)' : 'var(--tm-text)' }}>
                    {wip}<span className="text-sm" style={FAINT}>/3</span>
                  </p>
                  <p className="text-xs" style={FAINT}>active tasks (WIP)</p>
                </div>
              </div>
            </Card>

            {/* My stats — mini dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {[
                { label: 'Avg score', value: myAvg == null ? '—' : myAvg.toFixed(2), sub: myBand, color: bandColor },
                { label: 'Assigned', value: assignments.length, sub: 'total tasks', color: 'var(--tm-text)' },
                { label: 'Completed', value: myDone.length, sub: 'finished', color: 'var(--tm-sky)' },
                { label: 'Active', value: myActive.length, sub: 'in progress', color: 'var(--tm-emerald)' },
                { label: 'Avg time', value: myAvgTime === '—' ? '—' : `${myAvgTime}h`, sub: 'per task', color: 'var(--tm-text)' },
                { label: 'Late', value: myLate, sub: `${myOnTime} on time`, color: myLate > 0 ? 'var(--tm-amber)' : 'var(--tm-text-muted)' },
              ].map(m => (
                <Card key={m.label} className="p-3.5">
                  <p className="text-[11px] mb-1" style={FAINT}>{m.label}</p>
                  <p className="text-xl font-semibold tabular-nums" style={{ color: m.color }}>{m.value}</p>
                  <p className="text-[10px] mt-0.5 capitalize" style={FAINT}>{m.sub}</p>
                </Card>
              ))}
            </div>

            <Card className="px-4 py-3 mb-6 flex items-start gap-2.5">
              <span className="mt-px shrink-0" style={FAINT}><Icon name="chart" size={15} /></span>
              <p className="text-xs" style={FAINT}>
                <span className="font-medium" style={MUTED}>How your score works:</span> score = committed hours ÷ (committed + actual hours), between 0 and 1.
                Finishing in less time than budgeted scores higher. Bands:{' '}
                <span style={{ color: 'var(--tm-emerald)' }}>High ≥ 0.6</span> · <span style={{ color: 'var(--tm-amber)' }}>Avg ≥ 0.4</span> · <span style={{ color: 'var(--tm-rose)' }}>Low &lt; 0.4</span>.
              </p>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* My skills */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium" style={TEXT}>My skills</p>
                  {!editing ? (
                    <Button variant="ghost" className="tm-btn-sm" onClick={() => setEditing(true)}>Edit skills</Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button className="tm-btn-sm" onClick={saveSkills} disabled={saving}>
                        {saving ? 'Saving…' : <><Icon name="check" size={13} /> Save</>}
                      </Button>
                      <Button variant="ghost" className="tm-btn-sm" onClick={() => {
                        setEditing(false)
                        setMySkills((student.student_skills || []).map((ss: any) => ({ skill_id: ss.skill_id, proficiency: ss.proficiency })))
                      }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {!editing ? (
                  (student.student_skills || []).length === 0 ? (
                    <p className="text-xs" style={FAINT}>No skills declared yet. Click &ldquo;Edit skills&rdquo; to add some.</p>
                  ) : (
                    <div className="flex gap-1.5 flex-wrap">
                      {student.student_skills.map((ss: any) => (
                        <span key={ss.skill_id} className="tm-chip">
                          {ss.skills?.skill_name}<span className="ml-1" style={FAINT}>· {PROFICIENCY[ss.proficiency]}</span>
                        </span>
                      ))}
                    </div>
                  )
                ) : (
                  <SkillPicker skills={skills} value={mySkills} onChange={setMySkills} />
                )}
              </Card>

              {/* My assigned tasks */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium" style={TEXT}>My assigned tasks</p>
                  <Link href="/my-tasks" className="text-xs inline-flex items-center gap-1 hover:underline" style={FAINT}>
                    Open My Tasks <Icon name="arrowRight" size={12} />
                  </Link>
                </div>
                {assignments.length === 0 ? (
                  <p className="text-xs" style={FAINT}>No tasks assigned to you yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {assignments.map(a => (
                      <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg p-3" style={ROW}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={TEXT}>{a.tasks?.description || '(task removed)'}</p>
                          <p className="text-xs mt-0.5" style={FAINT}>
                            Assigned {a.assigned_date}
                            {a.completed_at ? ` · Completed ${new Date(a.completed_at).toLocaleDateString()}` : ''}
                            {a.score != null ? ` · Score ${a.score}` : ''}
                          </p>
                        </div>
                        {a.status === 'In Progress' && (
                          <Button variant="ghost" className="tm-btn-sm" style={{ color: 'var(--tm-emerald)' }}
                            onClick={() => completeAssignment(a.id, a.tasks?.description || 'this task')}>
                            <Icon name="check" size={13} /> Complete
                          </Button>
                        )}
                        <Badge accent={statusAccent(a.status)}>{statusLabel(a.status)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Recommended tasks for me */}
            <Card className="p-5 mt-6">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium flex items-center gap-2" style={TEXT}>
                  <span style={{ color: 'var(--tm-primary-text)' }}><Icon name="star" size={16} /></span> Suggested for you
                </p>
                {wip >= 3 && <Badge accent="amber">At workload limit ({wip}/3)</Badge>}
              </div>
              <p className="text-xs mb-4" style={FAINT}>Tasks the matcher considered you for — by skill fit or as a growth opportunity. Pick one up to add it to your own list{wip >= 3 ? ', once you finish an active task' : ''}, or your leader can assign you.</p>
              {recommended.qualified.length === 0 && recommended.growth.length === 0 ? (
                <p className="text-xs" style={FAINT}>No suggested tasks right now.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...recommended.qualified.map((r: any) => ({ ...r, _group: 'fit' })),
                    ...recommended.growth.map((r: any) => ({ ...r, _group: 'growth' }))].map(r => (
                    <div key={r.task_id} className="flex flex-wrap items-center gap-3 rounded-lg p-3" style={ROW}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm flex items-center gap-2 flex-wrap" style={TEXT}>
                          {r.description}
                          <Badge accent={r._group === 'fit' ? 'emerald' : 'amber'}>{r._group === 'fit' ? 'skill fit' : 'growth'}</Badge>
                        </p>
                        <p className="text-xs mt-0.5" style={MUTED}>{r.reason}</p>
                        <p className="text-xs mt-0.5" style={FAINT}>
                          {r.committed_hours != null ? `${r.committed_hours}h` : (r.estimated_days ? `~${r.estimated_days}d` : '')}
                          {r.severity ? ` · ${r.severity}` : ''}
                        </p>
                      </div>
                      <Badge accent={statusAccent(r.status)}>{statusLabel(r.status)}</Badge>
                      <Button variant="ghost" className="tm-btn-sm shrink-0"
                        onClick={() => pickTask(r.task_id, r.description)}
                        disabled={picking === r.task_id || wip >= 3}
                        title={wip >= 3 ? 'You are at your workload limit (3 active tasks)' : 'Add this task to your own list'}>
                        {picking === r.task_id ? 'Adding…' : <><Icon name="plus" size={13} /> Pick this task</>}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
