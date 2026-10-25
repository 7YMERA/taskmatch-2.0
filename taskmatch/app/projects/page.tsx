'use client'

/* Projects: the workspace's tasks grouped the way a team plans them. Each card shows how far the
   project has got and what needs attention; leads and admins create, edit and archive them. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import ProjectChip from '../components/ProjectChip'
import { effectiveRole, can } from '../lib/role'
import { logActivity } from '../lib/log'
import { toast, confirmDialog } from '../lib/ui'
import { fetchProjects, keyFrom, projectColor, PROJECT_COLORS, type Project } from '../lib/projects'
import { accentColor, Button, Card, Drawer, EmptyState, Field, Icon, Input, PageHeader, SkeletonCard, soft } from '../components/ui'

type TaskLite = { id: string; project_id: string | null; status: string; due_date: string | null }
type Form = { id?: string; name: string; key: string; description: string; color: string }
const EMPTY: Form = { name: '', key: '', description: '', color: PROJECT_COLORS[0] }

export default function Projects() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<TaskLite[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState<Form | null>(null)
  const [keyTouched, setKeyTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [list, { data }] = await Promise.all([
      fetchProjects(),
      supabase.from('tasks').select('id, project_id, status, due_date'),
    ])
    setProjects(list)
    setTasks((data as TaskLite[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setRole(effectiveRole(session))
      load()
    })
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const statsFor = (id: string | null) => {
    const mine = tasks.filter(t => t.project_id === id)
    const done = mine.filter(t => t.status === 'Completed').length
    return {
      total: mine.length, done, open: mine.length - done,
      overdue: mine.filter(t => t.status !== 'Completed' && t.due_date && t.due_date < today).length,
      pct: mine.length ? Math.round((done / mine.length) * 100) : 0,
    }
  }
  const manage = can(role, 'tasks.manage')
  const active = projects.filter(p => !p.archived)
  const archived = projects.filter(p => p.archived)
  const shown = showArchived ? archived : active
  const loose = statsFor(null)

  const openForm = (p?: Project) => {
    setKeyTouched(!!p)
    setForm(p ? { id: p.id, name: p.name, key: p.key || '', description: p.description || '', color: p.color || PROJECT_COLORS[0] } : EMPTY)
  }

  const save = async () => {
    if (!form) return
    const name = form.name.trim()
    const key = form.key.trim().toUpperCase()
    if (!name) return toast('Give the project a name.', 'error')
    if (key && !/^[A-Z][A-Z0-9]{1,5}$/.test(key)) return toast('The key is 2 to 6 letters or numbers, starting with a letter.', 'error')
    if (projects.some(p => p.id !== form.id && key && p.key === key)) return toast(`Another project already uses ${key}.`, 'error')
    setSaving(true)
    const row = { name, key: key || null, description: form.description.trim() || null, color: form.color }
    const { data, error } = form.id
      ? await supabase.from('projects').update(row).eq('id', form.id).select().single()
      : await supabase.from('projects').insert(row).select().single()
    setSaving(false)
    if (error) return toast(error.message, 'error')
    await logActivity({
      action: form.id ? 'project.updated' : 'project.created', entity_type: 'project', entity_id: data.id,
      summary: `${form.id ? 'Updated' : 'Created'} project '${name}'${key ? ` (${key})` : ''}`, details: row,
    })
    toast(form.id ? 'Project saved.' : `${name} created.`, 'success')
    setForm(null)
    load()
  }

  const setArchived = async (p: Project, value: boolean) => {
    if (value) {
      const ok = await confirmDialog({
        title: `Archive ${p.name}?`,
        message: 'It moves out of the project list and the task filters. Its tasks stay as they are, and you can restore it any time.',
        confirmLabel: 'Archive',
      })
      if (!ok) return
    }
    const { error } = await supabase.from('projects').update({ archived: value }).eq('id', p.id)
    if (error) return toast(error.message, 'error')
    await logActivity({
      action: value ? 'project.archived' : 'project.restored', entity_type: 'project', entity_id: p.id,
      summary: `${value ? 'Archived' : 'Restored'} project '${p.name}'`,
    })
    toast(value ? `${p.name} archived.` : `${p.name} restored.`, 'success')
    setForm(null)
    load()
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Projects"
          sub={loading ? 'Group tasks by project to see how each piece of work is going.'
            : `${active.length} active project${active.length === 1 ? '' : 's'}${archived.length ? ` · ${archived.length} archived` : ''} · ${tasks.length} tasks`}
          actions={manage && <Button onClick={() => openForm()}><Icon name="plus" size={15} /> New project</Button>} />

        {archived.length > 0 && (
          <div className="tm-seg mb-5" role="group" aria-label="Which projects">
            <button aria-pressed={!showArchived} onClick={() => setShowArchived(false)}>Active <span className="text-faint tabular-nums">{active.length}</span></button>
            <button aria-pressed={showArchived} onClick={() => setShowArchived(true)}>Archived <span className="text-faint tabular-nums">{archived.length}</span></button>
          </div>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : shown.length === 0 ? (
          <Card className="max-w-xl">
            <EmptyState icon={<Icon name="folder" size={28} />}
              title={showArchived ? 'No archived projects' : 'No projects yet'}
              hint={showArchived ? '' : manage
                ? 'A project groups related tasks, like a product, a client or a release. Each one gets a short key that shows on its tasks.'
                : 'Your team leads haven’t set up any projects yet.'}
              action={!showArchived && manage ? <Button onClick={() => openForm()}><Icon name="plus" size={15} /> Create the first project</Button> : undefined} />
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {shown.map(p => {
              const s = statsFor(p.id)
              const c = projectColor(p)
              return (
                <Card key={p.id} hover className="p-5 flex flex-col relative overflow-hidden">
                  <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: c }} aria-hidden />
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: soft(c, 16), color: c }}>
                      <Icon name="folder" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/tasks?project=${p.id}`} className="text-[15px] font-semibold text-fg truncate hover:underline">{p.name}</Link>
                        <ProjectChip project={p} />
                      </div>
                      <p className="text-xs text-faint mt-0.5 line-clamp-2 min-h-[2lh]">{p.description || 'No description'}</p>
                    </div>
                    {manage && (
                      <button className="tm-btn tm-btn-quiet tm-btn-icon -mr-2 -mt-1" onClick={() => openForm(p)} aria-label={`Edit ${p.name}`} title="Edit">
                        <Icon name="edit" size={15} />
                      </button>
                    )}
                  </div>

                  <div className="mt-5">
                    <div className="flex items-baseline justify-between text-xs mb-1.5">
                      <span className="text-muted">{s.total ? `${s.done} of ${s.total} done` : 'No tasks yet'}</span>
                      <span className="text-fg font-medium tabular-nums">{s.pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tm-track)' }}
                      role="progressbar" aria-valuenow={s.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: c }} />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--tm-border)] flex items-center gap-4 text-xs">
                    <span className="text-muted"><span className="text-fg font-medium tabular-nums">{s.open}</span> open</span>
                    {s.overdue > 0
                      ? <span className="inline-flex items-center gap-1" style={{ color: 'var(--tm-rose)' }}><Icon name="alert" size={12} /> {s.overdue} overdue</span>
                      : s.total > 0 && <span className="text-faint">Nothing overdue</span>}
                    {p.archived && manage
                      ? <button className="ml-auto text-primary-text hover:underline" onClick={() => setArchived(p, false)}>Restore</button>
                      : <Link href={`/tasks?project=${p.id}`} className="ml-auto text-primary-text hover:underline inline-flex items-center gap-1">View tasks <Icon name="arrowRight" size={12} /></Link>}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {!loading && !showArchived && loose.total > 0 && projects.length > 0 && (
          <p className="text-xs text-faint mt-5">
            {loose.total} task{loose.total === 1 ? ' isn’t' : 's aren’t'} in a project yet.{' '}
            <Link href="/tasks?project=__none__" className="text-primary-text hover:underline">Show {loose.total === 1 ? 'it' : 'them'}</Link>
            {manage && ' and use "Move to project" to file them.'}
          </p>
        )}

        <Drawer open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit project' : 'New project'}
          sub={form?.id ? undefined : 'Group related tasks. You can move existing tasks into it from the Tasks page.'}
          footer={form && <>
            {form.id && <Button variant="quiet" onClick={() => setArchived(projects.find(p => p.id === form.id)!, true)}>Archive</Button>}
            <Button variant="ghost" className="ml-auto" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : form.id ? 'Save' : 'Create project'}</Button>
          </>}>
          {form && (
            <div className="flex flex-col gap-4">
              <Field label="Name">
                <Input autoFocus value={form.name} maxLength={80} placeholder="e.g. Website relaunch"
                  onChange={e => setForm({ ...form, name: e.target.value, key: keyTouched ? form.key : keyFrom(e.target.value) })} />
              </Field>
              <Field label="Key">
                <Input value={form.key} maxLength={6} placeholder="WR" className="font-mono uppercase"
                  onChange={e => { setKeyTouched(true); setForm({ ...form, key: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }) }} />
              </Field>
              <p className="text-xs text-faint -mt-2">2 to 6 letters or numbers. It shows as a tag on the project&apos;s tasks.</p>
              <Field label="Description">
                <textarea className="tm-input min-h-[84px]" value={form.description} maxLength={500}
                  placeholder="What this project is for (optional)" onChange={e => setForm({ ...form, description: e.target.value })} />
              </Field>
              <div>
                <p className="text-xs text-muted mb-2">Colour</p>
                <div className="flex gap-2" role="radiogroup" aria-label="Project colour">
                  {PROJECT_COLORS.map(k => (
                    <button key={k} type="button" role="radio" aria-checked={form.color === k} aria-label={k}
                      onClick={() => setForm({ ...form, color: k })}
                      className="w-8 h-8 rounded-full grid place-items-center transition"
                      style={{ background: accentColor(k), boxShadow: form.color === k ? `0 0 0 2px var(--tm-bg-elev), 0 0 0 4px ${accentColor(k)}` : undefined }}>
                      {form.color === k && <Icon name="check" size={14} strokeWidth={2.6} style={{ color: 'var(--tm-bg)' }} />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg p-3 flex items-center gap-2 text-sm" style={{ background: 'var(--tm-surface-1)', border: '1px solid var(--tm-border)' }}>
                <span className="text-xs text-faint">Preview</span>
                <ProjectChip project={{ id: '', name: form.name || 'Project', key: form.key || null, description: null, color: form.color, archived: false }} />
                <span className="text-fg truncate">{form.name ? 'A task in this project' : 'Name your project'}</span>
              </div>
            </div>
          )}
        </Drawer>
      </main>
    </div>
  )
}
