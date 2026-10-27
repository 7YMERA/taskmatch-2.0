'use client'

/* Task quick view: the essentials of one task in a side panel, so a lead can check or change
   it without losing their place in the list. Leads edit fields in place; each change saves
   straight away and is written to the activity log with its old and new value. */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/log'
import { toast } from '../lib/ui'
import { Drawer, Icon } from './ui'
import { severityDot } from './TaskViews'
import ProjectChip from './ProjectChip'
import type { Project } from '../lib/projects'

const STATUSES = [['New', 'New'], ['In Progress', 'Ongoing'], ['Completed', 'Completed']]
const SEVERITIES = ['Low', 'Medium', 'Critical']
const LEVEL = ['', 'Beginner', 'Intermediate', 'Advanced']
const initials = (n: string) => (n || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()

type Field = 'description' | 'status' | 'severity' | 'due_date' | 'start_date' | 'committed_hours' | 'group_label' | 'project_id'

export default function TaskQuickView({ task, assignees, groups, projects = [], canEdit, locked, onClose, onChanged }: {
  task: any | null
  assignees: { student_id: string; status: string; students?: { name: string } | null }[]
  groups: string[]
  projects?: Project[]
  canEdit: boolean
  locked: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [draft, setDraft] = useState<any>(task)
  const [comments, setComments] = useState<any[]>([])
  const [saving, setSaving] = useState<Field | null>(null)

  useEffect(() => { setDraft(task) }, [task])
  useEffect(() => {
    if (!task) return
    supabase.from('task_comments').select('id, author_email, body, created_at').eq('task_id', task.id)
      .order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setComments(data || []))
  }, [task?.id])

  if (!task || !draft) return null

  const projectName = (id: string | null) => projects.find(p => p.id === id)?.name || 'none'

  const save = async (field: Field, raw: any) => {
    const value = raw === '' ? null : field === 'committed_hours' ? (raw == null ? null : Number(raw)) : raw
    if (field === 'committed_hours' && value != null && (isNaN(value) || value < 0)) { toast('Hours must be a positive number.', 'error'); setDraft(task); return }
    if (field === 'description' && !value) { toast('A task needs a description.', 'error'); setDraft(task); return }
    if ((task[field] ?? null) === value) return
    setSaving(field)
    const { error } = await supabase.from('tasks').update({ [field]: value }).eq('id', task.id)
    setSaving(null)
    if (error) { toast(error.message, 'error'); setDraft(task); return }
    const label = { description: 'description', status: 'status', severity: 'severity', due_date: 'due date', start_date: 'start date', committed_hours: 'committed hours', group_label: 'group', project_id: 'project' }[field]
    await logActivity({
      action: field === 'status' ? 'task.status_changed' : 'task.updated', entity_type: 'task', entity_id: task.id,
      summary: field === 'project_id'
        ? `Moved '${task.description}' ${value ? `to project ${projectName(value)}` : `out of project ${projectName(task.project_id)}`}`
        : `Changed ${label} of '${task.description}': ${task[field] ?? 'none'} → ${value ?? 'none'}`,
      details: { field, from: task[field] ?? null, to: value },
    })
    onChanged()
  }

  const row = (label: string, field: Field, control: React.ReactNode) => (
    <div className="grid grid-cols-[7.5rem_1fr] items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--tm-border)' }}>
      <label htmlFor={`qv-${field}`} className="text-xs text-muted">{label}</label>
      <div className="flex items-center gap-2 min-w-0">{control}{saving === field && <span className="text-[11px] text-faint">Saving…</span>}</div>
    </div>
  )
  const readOnly = !canEdit || locked
  const fieldCls = 'tm-input !py-1.5 !text-sm'

  return (
    <Drawer open onClose={onClose}
      title={<span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: severityDot(draft.severity) }} />Task details</span>}
      sub={locked ? 'Closed: more than 7 days overdue, so it can no longer change.' : canEdit ? 'Changes save as soon as you make them.' : undefined}
      footer={<>
        <Link href={`/tasks/${task.id}`} className="tm-btn tm-btn-primary tm-btn-sm">Open full page <Icon name="arrowRight" size={13} /></Link>
        <button onClick={onClose} className="tm-btn tm-btn-ghost tm-btn-sm ml-auto">Close</button>
      </>}>
      {readOnly
        ? <p className="text-[15px] font-medium text-fg mb-3">{draft.description}</p>
        : <textarea id="qv-description" aria-label="Description" rows={2} className="tm-input !text-[15px] font-medium mb-3 resize-none"
            value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })}
            onBlur={e => save('description', e.target.value.trim())} />}

      <div className="mb-5">
        {projects.length > 0 && row('Project', 'project_id', readOnly
          ? <span className="text-sm text-fg flex items-center gap-2"><ProjectChip project={projects.find(p => p.id === draft.project_id)} />{draft.project_id ? projectName(draft.project_id) : '—'}</span>
          : <select id="qv-project_id" className={fieldCls} value={draft.project_id || ''} onChange={e => { setDraft({ ...draft, project_id: e.target.value }); save('project_id', e.target.value) }}>
              <option value="">No project</option>
              {projects.filter(p => !p.archived || p.id === draft.project_id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>)}
        {row('Status', 'status', readOnly
          ? <span className="text-sm text-fg">{STATUSES.find(s => s[0] === draft.status)?.[1] || draft.status}</span>
          : <select id="qv-status" className={fieldCls} value={draft.status} onChange={e => { setDraft({ ...draft, status: e.target.value }); save('status', e.target.value) }}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>)}
        {row('Severity', 'severity', readOnly
          ? <span className="text-sm text-fg">{draft.severity || 'Low'}</span>
          : <select id="qv-severity" className={fieldCls} value={draft.severity || 'Low'} onChange={e => { setDraft({ ...draft, severity: e.target.value }); save('severity', e.target.value) }}>
              {SEVERITIES.map(s => <option key={s}>{s}</option>)}
            </select>)}
        {row('Start date', 'start_date', readOnly
          ? <span className="text-sm text-fg">{draft.start_date || '—'}</span>
          : <input id="qv-start_date" type="date" className={fieldCls} value={draft.start_date || ''} onChange={e => setDraft({ ...draft, start_date: e.target.value })} onBlur={e => save('start_date', e.target.value)} />)}
        {row('Due date', 'due_date', readOnly
          ? <span className="text-sm text-fg">{draft.due_date || '—'}</span>
          : <input id="qv-due_date" type="date" className={fieldCls} value={draft.due_date || ''} onChange={e => setDraft({ ...draft, due_date: e.target.value })} onBlur={e => save('due_date', e.target.value)} />)}
        {row('Committed hours', 'committed_hours', readOnly
          ? <span className="text-sm text-fg">{draft.committed_hours ?? '—'}</span>
          : <input id="qv-committed_hours" inputMode="decimal" className={fieldCls} value={draft.committed_hours ?? ''} placeholder="e.g. 8"
              onChange={e => setDraft({ ...draft, committed_hours: e.target.value })} onBlur={e => save('committed_hours', e.target.value.trim())} />)}
        {row('Group', 'group_label', readOnly
          ? <span className="text-sm text-fg">{draft.group_label || '—'}</span>
          : <select id="qv-group_label" className={fieldCls} value={draft.group_label || ''} onChange={e => { setDraft({ ...draft, group_label: e.target.value }); save('group_label', e.target.value) }}>
              <option value="">No group</option>
              {groups.map(g => <option key={g}>{g}</option>)}
            </select>)}
      </div>

      <p className="text-xs font-medium text-muted mb-2">Required skills</p>
      <div className="flex flex-wrap gap-1.5 mb-5">
        {(task.task_skills || []).length === 0 ? <span className="text-xs text-faint">None</span>
          : task.task_skills.map((ts: any) => <span key={ts.skill_id} className="tm-chip">{ts.skills?.skill_name}<span className="text-faint"> · {LEVEL[ts.min_proficiency] || ''}+</span></span>)}
      </div>

      <p className="text-xs font-medium text-muted mb-2">People on it ({assignees.length})</p>
      {assignees.length === 0 ? <p className="text-xs text-faint mb-5">Nobody yet. Open the full page to see recommendations and assign.</p> : (
        <div className="flex flex-col gap-1.5 mb-5">
          {assignees.map(a => (
            <div key={a.student_id} className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>{initials(a.students?.name || '?')}</span>
              <Link href={`/people/${a.student_id}`} className="text-sm text-fg hover:underline flex-1 min-w-0 truncate">{a.students?.name}</Link>
              <span className="text-[11px] text-faint">{a.status === 'In Progress' ? 'Working on it' : a.status === 'Assigned' ? 'Not started' : a.status}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs font-medium text-muted mb-2">Latest comments</p>
      {comments.length === 0 ? <p className="text-xs text-faint">No comments yet.</p> : (
        <div className="flex flex-col gap-2">
          {comments.map(c => (
            <div key={c.id} className="rounded-lg p-2.5" style={{ background: 'var(--tm-surface-2)' }}>
              <p className="text-[11px] text-faint">{c.author_email} · {new Date(c.created_at).toLocaleDateString()}</p>
              <p className="text-sm text-fg mt-0.5 line-clamp-3">{c.body}</p>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}
