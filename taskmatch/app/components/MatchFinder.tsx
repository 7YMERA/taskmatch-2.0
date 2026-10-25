'use client'

/* People › Find a match. Describe a need (skills at a level, and optionally what the work is) or
   start from an open task, and get everyone ranked by fit score with the reasons. From an open
   task, a lead can assign straight from the list. */

import { useEffect, useState } from 'react'
import axios from 'axios'
import { supabase, API, authHeaders } from '../lib/supabase'
import { toast } from '../lib/ui'
import SkillPicker from './SkillPicker'
import { Badge, Button, Card, EmptyState, Icon, Input, Skeleton } from './ui'
import { FitRing, FitSummary, type FitFactor } from './FitScore'

type Rec = {
  student_id: string; name: string; avatar_url?: string; fit_score: number; fit_factors: FitFactor[]
  qualified: boolean; over_wip: boolean; away: boolean; away_until?: string; wip: number; active_hours: number
  met_count: number; total_required: number; proven: string[]; justification: string
  mentor?: { student_id: string; name: string; skill_name: string } | null
}


export default function MatchFinder({ skills, canAssign, onOpenPerson, initialNeed = [] }: {
  skills: { id: string; skill_name: string }[]
  canAssign: boolean
  onOpenPerson: (id: string) => void
  initialNeed?: { skill_id: string; min_proficiency: number }[]
}) {
  const [need, setNeed] = useState(initialNeed)
  const [description, setDescription] = useState('')
  const [taskId, setTaskId] = useState('')
  const [openTasks, setOpenTasks] = useState<any[]>([])
  const [recs, setRecs] = useState<Rec[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState('')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    supabase.from('tasks').select('id, description, status, task_skills(skill_id, min_proficiency)')
      .in('status', ['New', 'In Progress']).order('description')
      .then(({ data }) => setOpenTasks((data || []).filter((t: any) => (t.task_skills || []).length)))
  }, [])

  const pickTask = (id: string) => {
    setTaskId(id)
    const t = openTasks.find(x => x.id === id)
    if (t) {
      setNeed(t.task_skills.map((ts: any) => ({ skill_id: ts.skill_id, min_proficiency: ts.min_proficiency || 1 })))
      setDescription(t.description || '')
    }
    setRecs(null)
  }

  const find = async () => {
    if (!need.length) return toast('Pick at least one skill', 'error')
    setLoading(true); setShowAll(false)
    try {
      const res = await axios.post(`${API}/match/people`, {
        skills: need.map(n => ({ skill_id: n.skill_id, min_level: n.min_proficiency })), description,
      }, { headers: await authHeaders() })
      setRecs(res.data.recommendations)
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not reach the server. It may be waking up; try again in a moment.', 'error')
    } finally { setLoading(false) }
  }

  const assign = async (r: Rec) => {
    if (!taskId || assigning) return
    setAssigning(r.student_id)
    try {
      await axios.post(`${API}/assign`, { task_id: taskId, student_id: r.student_id }, { headers: await authHeaders() })
      toast(`${r.name} assigned`, 'success')
      setRecs(prev => prev && prev.filter(x => x.student_id !== r.student_id))
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not assign', 'error')
    } finally { setAssigning('') }
  }

  const qualified = (recs || []).filter(r => r.qualified)
  const others = (recs || []).filter(r => !r.qualified)
  const shown = showAll ? [...qualified, ...others] : [...qualified, ...others.slice(0, Math.max(0, 3 - qualified.length))]

  return (
    <div className="grid lg:grid-cols-[22rem_1fr] gap-4 items-start">
      <Card className="p-5 lg:sticky lg:top-6">
        <p className="text-sm font-medium text-fg flex items-center gap-2"><span className="text-primary-text"><Icon name="target" size={16} /></span> Find the right person</p>
        <p className="text-xs text-faint mt-1 mb-4">Say what the work needs. Everyone is scored out of 100 on skills, proven experience, availability and track record.</p>

        <label className="tm-label">Start from an open task <span className="text-faint font-normal">(optional)</span></label>
        <select value={taskId} onChange={e => pickTask(e.target.value)} className="tm-input mb-4">
          <option value="">A new need, not a task yet</option>
          {openTasks.map(t => <option key={t.id} value={t.id}>{t.description}</option>)}
        </select>

        <label className="tm-label">Skills needed</label>
        <div className="mb-4 max-h-56 overflow-y-auto">
          <SkillPicker skills={[...skills].sort((a, b) => a.skill_name.localeCompare(b.skill_name))} value={need} onChange={v => { setNeed(v); setRecs(null) }} field="min_proficiency" />
        </div>

        <label className="tm-label">What is the work? <span className="text-faint font-normal">(optional, finds similar past work)</span></label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Checkout page payment form" className="mb-4" />

        <Button onClick={find} disabled={loading || !need.length} className="w-full justify-center">
          {loading ? 'Scoring…' : <><Icon name="search" size={15} /> Find people</>}
        </Button>
      </Card>

      <Card className="p-5">
        {loading ? (
          <div className="flex flex-col gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} style={{ height: 72 }} />)}</div>
        ) : recs == null ? (
          <EmptyState icon={<Icon name="target" size={28} />} title="Who should take it?"
            hint="Pick the skills on the left, or start from an open task, then press Find people." />
        ) : recs.length === 0 ? (
          <EmptyState icon={<Icon name="users" size={28} />} title="Nobody to rank yet" hint="Add people to the team first." />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
              <p className="text-sm font-medium text-fg">
                {qualified.length ? `${qualified.length} ${qualified.length === 1 ? 'person fits' : 'people fit'}` : 'Nobody fully fits yet'}
                <span className="text-faint font-normal"> · ranked by fit score</span>
              </p>
              {!qualified.length && <span className="text-xs text-faint">Closest matches below, with who could mentor them.</span>}
            </div>
            <div className="flex flex-col gap-2">
              {shown.map((r, i) => (
                <div key={r.student_id} className="rounded-xl border p-3.5 flex gap-3" style={{ borderColor: i === 0 && r.qualified ? 'color-mix(in srgb, var(--tm-emerald) 45%, var(--tm-border))' : 'var(--tm-border)' }}>
                  <FitRing score={r.fit_score} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => onOpenPerson(r.student_id)} className="text-sm font-medium text-fg hover:underline">{r.name}</button>
                      {i === 0 && r.qualified && <Badge accent="emerald" className="!text-[11px] !py-0">Top pick</Badge>}
                      {r.away && <Badge accent="amber" className="!text-[11px] !py-0">Away until {r.away_until}</Badge>}
                      {r.over_wip && !r.away && <Badge accent="rose" className="!text-[11px] !py-0">At limit</Badge>}
                      {!r.qualified && !r.over_wip && !r.away && <Badge accent="sky" className="!text-[11px] !py-0">{r.met_count}/{r.total_required} skills</Badge>}
                      {r.proven.length > 0 && <span className="text-[11px] inline-flex items-center gap-1" style={{ color: 'var(--tm-emerald)' }}><Icon name="check" size={11} strokeWidth={2.5} /> Proven: {r.proven.join(', ')}</span>}
                    </div>
                    <p className="text-[11px] text-faint mt-0.5">{r.justification} · {r.wip} active, {r.active_hours}h</p>
                    <div className="mt-2"><FitSummary score={r.fit_score} factors={r.fit_factors} /></div>
                  </div>
                  {canAssign && taskId && (
                    <Button variant="ghost" className="tm-btn-sm shrink-0 self-start" disabled={r.over_wip || r.away || assigning === r.student_id} onClick={() => assign(r)}>
                      {assigning === r.student_id ? 'Assigning…' : <><Icon name="plus" size={14} /> Assign</>}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {!showAll && shown.length < recs.length && (
              <button onClick={() => setShowAll(true)} className="text-xs text-faint hover:underline mt-3">Show everyone ({recs.length})</button>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
