'use client'

/* Person quick view: someone's skills, workload and recent work in a side panel, so a lead
   can size someone up for a task without leaving the People page. */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { Drawer, Icon } from './ui'

const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced']
const initials = (n: string) => (n || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
const fmtDay = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function PersonQuickView({ person, wip, wipLimit, stat, showScores, groupColor, onClose }: {
  person: any | null
  wip?: { wip: number; active_tasks?: { task_id: string; status: string; description: string }[] }
  wipLimit: number
  stat?: { avg_score: number | null; completed_count: number; band: string }
  showScores: boolean
  groupColor: (g: string) => string
  onClose: () => void
}) {
  const [history, setHistory] = useState<any[] | null>(null)
  useEffect(() => {
    if (!person) return
    setHistory(null)
    supabase.from('assignments').select('id, status, completed_at, assigned_date, tasks(id, description, due_date)')
      .eq('student_id', person.id).order('assigned_date', { ascending: false })
      .then(({ data }) => setHistory(data || []))
  }, [person?.id])

  if (!person) return null
  const skills = [...(person.student_skills || [])].sort((a: any, b: any) => b.proficiency - a.proficiency || (a.skills?.skill_name || '').localeCompare(b.skills?.skill_name || ''))
  const done = (history || []).filter(a => a.status === 'Completed')
  const dated = done.filter(a => a.tasks?.due_date && a.completed_at)
  const onTime = dated.filter(a => a.completed_at.slice(0, 10) <= a.tasks.due_date).length
  const w = wip?.wip ?? 0
  const state = w === 0 ? ['Free right now', 'var(--tm-chart-2)'] : w >= wipLimit ? ['At their limit', 'var(--tm-rose)'] : [`Has room for ${wipLimit - w} more`, 'var(--tm-text-muted)']

  return (
    <Drawer open onClose={onClose} width="max-w-md"
      title={<span className="flex items-center gap-3">
        {person.avatar_url
          ? <img src={person.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          : <span className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>{initials(person.name)}</span>}
        <span className="min-w-0">
          <span className="block truncate">{person.name}</span>
          <span className="block text-xs font-normal text-faint truncate">{[person.programme, person.year ? `Year ${person.year}` : null].filter(Boolean).join(' · ')}</span>
        </span>
      </span>}
      footer={<>
        <Link href={`/students/${person.id}`} className="tm-btn tm-btn-primary tm-btn-sm">Open full profile <Icon name="arrowRight" size={13} /></Link>
        {person.email && <a href={`mailto:${person.email}`} className="tm-btn tm-btn-ghost tm-btn-sm"><Icon name="mail" size={13} /> Email</a>}
        <button onClick={onClose} className="tm-btn tm-btn-ghost tm-btn-sm ml-auto">Close</button>
      </>}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted mb-5">
        {person.group_label && <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: groupColor(person.group_label) }} />{person.group_label}</span>}
        {person.email && <span className="truncate">{person.email}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="rounded-lg p-3" style={{ background: 'var(--tm-surface-2)' }}>
          <p className="text-[11px] text-faint">Workload</p>
          <p className="text-lg font-semibold tabular-nums text-fg">{w}<span className="text-xs text-faint">/{wipLimit}</span></p>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--tm-surface-2)' }}>
          <p className="text-[11px] text-faint">Finished</p>
          <p className="text-lg font-semibold tabular-nums text-fg">{history ? done.length : '…'}</p>
        </div>
        <div className="rounded-lg p-3" style={{ background: 'var(--tm-surface-2)' }}>
          <p className="text-[11px] text-faint">{showScores ? 'Avg score' : 'On time'}</p>
          <p className="text-lg font-semibold tabular-nums text-fg">
            {showScores ? (stat?.avg_score != null ? stat.avg_score.toFixed(2) : '—') : (dated.length ? `${Math.round(onTime / dated.length * 100)}%` : '—')}
          </p>
        </div>
      </div>

      <p className="text-xs font-medium text-muted mb-2 flex items-center gap-2">Working on now <span className="font-normal" style={{ color: state[1] }}>· {state[0]}</span></p>
      {(wip?.active_tasks || []).length === 0 ? <p className="text-xs text-faint mb-5">Nothing active.</p> : (
        <div className="flex flex-col gap-1.5 mb-5">
          {wip!.active_tasks!.map(t => (
            <Link key={t.task_id} href={`/tasks/${t.task_id}`} className="flex items-center gap-2 text-sm text-fg hover:underline">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.status === 'In Progress' ? 'var(--tm-emerald)' : 'var(--tm-amber)' }} />
              <span className="truncate flex-1">{t.description}</span>
              <span className="text-[11px] text-faint shrink-0">{t.status === 'In Progress' ? 'Ongoing' : 'Not started'}</span>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs font-medium text-muted mb-2">Skills ({skills.length})</p>
      {skills.length === 0 ? <p className="text-xs text-faint mb-5">No skills declared yet.</p> : (
        <div className="flex flex-col gap-2 mb-5">
          {skills.map((ss: any) => (
            <div key={ss.skill_id} className="grid grid-cols-[1fr_6rem_5.5rem] items-center gap-3">
              <span className="text-sm text-fg truncate">{ss.skills?.skill_name}</span>
              <span className="flex gap-1" aria-hidden>
                {[1, 2, 3].map(l => <span key={l} className="h-1.5 flex-1 rounded-full" style={{ background: l <= ss.proficiency ? 'var(--tm-chart-1)' : 'var(--tm-track)' }} />)}
              </span>
              <span className="text-[11px] text-muted">{LEVELS[ss.proficiency]}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs font-medium text-muted mb-2">Recently finished</p>
      {history == null ? <p className="text-xs text-faint">Loading…</p> : done.length === 0 ? <p className="text-xs text-faint">Nothing finished yet.</p> : (
        <div className="flex flex-col gap-1.5">
          {done.slice(0, 5).map(a => {
            const late = a.tasks?.due_date && a.completed_at && a.completed_at.slice(0, 10) > a.tasks.due_date
            return (
              <div key={a.id} className="flex items-center gap-2">
                <Link href={`/tasks/${a.tasks?.id}`} className="text-sm text-fg hover:underline truncate flex-1">{a.tasks?.description}</Link>
                {a.completed_at && <span className="text-[11px] text-faint shrink-0">{fmtDay(a.completed_at)}</span>}
                {late && <span className="text-[11px] shrink-0 inline-flex items-center gap-1" style={{ color: 'var(--tm-rose)' }}><Icon name="alert" size={11} /> Late</span>}
              </div>
            )
          })}
        </div>
      )}
    </Drawer>
  )
}
