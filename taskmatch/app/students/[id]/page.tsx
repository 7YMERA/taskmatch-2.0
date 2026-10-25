'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, API, authHeaders } from '../../lib/supabase'
import axios from 'axios'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'
import { effectiveRole } from '../../lib/role'
import { Card, Badge, Icon, Skeleton, SkeletonCard, EmptyState, bandAccent } from '../../components/ui'

const PROFICIENCY = ['', 'Beginner', 'Intermediate', 'Advanced']

// Theme-token text colours, so copy flips correctly between dark and light.
const TEXT = { color: 'var(--tm-text)' }
const FAINT = { color: 'var(--tm-text-faint)' }
const AVATAR = { background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }
const ROW = { background: 'var(--tm-surface-1)' }

export default function StudentDetail() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('')
  const [student, setStudent] = useState<any>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [stat, setStat] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')
      setUserRole(effectiveRole(session))
    })
    loadAll()
  }, [id])

  const loadAll = async () => {
    const { data: s } = await supabase
      .from('students')
      .select('*, student_skills(skill_id, proficiency, skills(skill_name))')
      .eq('id', id).single()
    setStudent(s)

    const { data: a } = await supabase
      .from('assignments')
      .select('*, tasks(id, description, status, severity, due_date)')
      .eq('student_id', id)
      .order('assigned_date', { ascending: false })
    setAssignments(a || [])

    try {
      const res = await axios.get(`${API}/student-stats`, { headers: await authHeaders() })
      setStat(res.data.stats.find((x: any) => x.student_id === id) || null)
    } catch { /* backend down */ }
    setLoading(false)
  }

  const statusAccent = (s: string) =>
    s === 'New' ? 'amber' as const
      : s === 'In Progress' || s === 'Assigned' ? 'emerald' as const
        : s === 'Completed' ? 'sky' as const
          : 'indigo' as const
  const scoreAccent = (score: number) => score >= 0.6 ? 'emerald' as const : score >= 0.4 ? 'amber' as const : 'rose' as const

  const initials = (n: string) => n?.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()

  const active = assignments.filter(a => a.status === 'In Progress')
  const done = assignments.filter(a => a.status === 'Completed')

  // Dashboard-style stats for this student
  const timed = done.filter(a => a.actual_hours != null)
  const avgTime = timed.length ? (timed.reduce((s, a) => s + a.actual_hours, 0) / timed.length).toFixed(1) : '—'
  const onTime = done.filter(a => a.completed_at && a.tasks?.due_date && a.completed_at.slice(0, 10) <= a.tasks.due_date).length
  const lateDeliveries = done.length - onTime
  const avgScoreDisplay = stat && stat.avg_score != null ? stat.avg_score : '—'
  const band = stat?.band || 'unrated'
  const bandColor = band === 'unrated' ? 'var(--tm-text)' : `var(--tm-${bandAccent(band)})`

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-xs hover:underline" style={FAINT}>
          <Icon name="arrowLeft" size={13} /> Back to students
        </Link>

        {loading ? (
          <div className="mt-4 flex flex-col gap-4">
            <Skeleton style={{ height: 88 }} />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} style={{ height: 76 }} />)}
            </div>
            <div className="grid md:grid-cols-2 gap-6"><SkeletonCard /><SkeletonCard /></div>
          </div>
        ) : !student ? (
          <Card className="mt-4">
            <EmptyState icon={<Icon name="user" size={28} />} title="Student not found" hint="They may have been removed from the roster." />
          </Card>
        ) : (
          <>
            {/* Header */}
            <Card className="p-5 mt-4 mb-6 tm-fade-up">
              <div className="flex flex-wrap items-center gap-4">
                {student.avatar_url
                  ? <img src={student.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover shrink-0" />
                  : <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={AVATAR}>{initials(student.name)}</div>}
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-semibold tracking-tight" style={TEXT}>{student.name}</h1>
                  <p className="text-xs mt-0.5" style={FAINT}>{student.matric} · {student.programme} · Year {student.year}</p>
                </div>
                {stat && (
                  <div className="text-right">
                    {stat.band === 'unrated'
                      ? <span className="tm-chip">unrated</span>
                      : <Badge accent={bandAccent(stat.band)}>{`${stat.avg_score} · ${stat.band}`}</Badge>}
                    <p className="text-xs mt-1.5" style={FAINT}>{stat.completed_count} completed · {active.length} active</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Stat cards — mini dashboard for this student */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {[
                { label: 'Avg score', value: avgScoreDisplay, sub: band === 'unrated' ? 'no data yet' : band, color: bandColor },
                { label: 'Assigned', value: assignments.length, sub: 'total tasks', color: 'var(--tm-text)' },
                { label: 'Completed', value: done.length, sub: 'finished', color: 'var(--tm-sky)' },
                { label: 'Active', value: active.length, sub: 'in progress', color: 'var(--tm-emerald)' },
                { label: 'Avg time', value: avgTime === '—' ? '—' : `${avgTime}h`, sub: 'per task', color: 'var(--tm-text)' },
                { label: 'Late', value: lateDeliveries, sub: `${onTime} on time`, color: lateDeliveries > 0 ? 'var(--tm-amber)' : 'var(--tm-text-muted)' },
              ].map(m => (
                <Card key={m.label} className="p-3.5">
                  <p className="text-[11px] mb-1" style={FAINT}>{m.label}</p>
                  <p className="text-xl font-semibold tabular-nums" style={{ color: m.color }}>{m.value}</p>
                  <p className="text-[10px] mt-0.5 capitalize" style={FAINT}>{m.sub}</p>
                </Card>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Skills */}
              <Card className="p-5">
                <p className="text-sm font-medium mb-4" style={TEXT}>Declared skills</p>
                {(student.student_skills || []).length === 0 ? (
                  <p className="text-xs" style={FAINT}>No skills declared.</p>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {student.student_skills.map((ss: any) => (
                      <span key={ss.skill_id} className="tm-chip">
                        {ss.skills?.skill_name}<span className="ml-1" style={FAINT}>· {PROFICIENCY[ss.proficiency]}</span>
                      </span>
                    ))}
                  </div>
                )}
              </Card>

              {/* Active tasks */}
              <Card className="p-5">
                <p className="text-sm font-medium mb-4" style={TEXT}>Active tasks ({active.length})</p>
                {active.length === 0 ? (
                  <p className="text-xs" style={FAINT}>No active tasks.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {active.map(a => (
                      <Link key={a.id} href={`/tasks/${a.tasks?.id}`} className="flex items-center gap-3 rounded-lg p-3 transition hover:brightness-110" style={ROW}>
                        <span className="flex-1 min-w-0 text-sm truncate" style={TEXT}>{a.tasks?.description || '(removed)'}</span>
                        <Badge accent={statusAccent(a.status)}>{a.status === 'In Progress' ? 'Ongoing' : a.status}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Completion history */}
            <Card className="p-5 mt-6">
              <p className="text-sm font-medium mb-4" style={TEXT}>Completion history ({done.length})</p>
              {done.length === 0 ? (
                <p className="text-xs" style={FAINT}>No completed tasks yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {done.map(a => (
                    <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg p-3" style={ROW}>
                      <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--tm-sky) 14%, transparent)', color: 'var(--tm-sky)' }}>
                        <Icon name="check" size={13} strokeWidth={2.4} />
                      </span>
                      <Link href={`/tasks/${a.tasks?.id}`} className="flex-1 min-w-0 text-sm hover:underline truncate" style={TEXT}>{a.tasks?.description || '(removed)'}</Link>
                      <span className="text-xs flex items-center gap-1" style={FAINT}>
                        {a.actual_hours != null ? `${Math.round(a.actual_hours * 10) / 10}h declared` : ''}
                        {userRole === 'leader' && a.timed_hours != null && <><span>·</span><Icon name="clock" size={12} />{`${Math.round(a.timed_hours * 10) / 10}h timed`}</>}
                      </span>
                      {a.score != null && <Badge accent={scoreAccent(a.score)}>score {a.score}</Badge>}
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
