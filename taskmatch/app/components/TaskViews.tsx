'use client'

/* Board and calendar views for the Tasks page. Both take the already-filtered task list,
   so search, filters and saved views apply to every view the same way. */

import React, { useState } from 'react'
import Link from 'next/link'
import { Icon } from './ui'

export const severityDot = (s: string) => s === 'Critical' ? 'var(--tm-rose)' : s === 'Medium' ? 'var(--tm-amber)' : 'var(--tm-text-faint)'
const initials = (name: string) => name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

type Assignee = { student_id: string; status: string; students?: { name: string } | null }

function Avatars({ people }: { people: Assignee[] }) {
  if (!people.length) return <span className="text-[11px] text-faint">Nobody yet</span>
  return (
    <span className="flex gap-1">
      {people.slice(0, 3).map(a => (
        <span key={a.student_id} title={a.students?.name}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
          style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>
          {initials(a.students?.name || '?')}
        </span>
      ))}
      {people.length > 3 && <span className="text-[11px] text-faint self-center">+{people.length - 3}</span>}
    </span>
  )
}

/* ─── Board: a column per stage. Leaders drag a card to change its status. ─── */
const COLUMN_CAP = 8  // long columns (usually Completed) fold after this many cards
const COLUMNS = [
  { status: 'New', label: 'New', dot: 'var(--tm-amber)' },
  { status: 'In Progress', label: 'Ongoing', dot: 'var(--tm-emerald)' },
  { status: 'Completed', label: 'Completed', dot: 'var(--tm-sky)' },
]

export function TaskBoard({ tasks, assignees, canMove, isLocked, onMove, flags }: {
  tasks: any[]
  assignees: Record<string, Assignee[]>
  canMove: boolean
  isLocked: (t: any) => boolean
  onMove: (id: string, status: string) => void
  flags: (t: any) => React.ReactNode
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {COLUMNS.map(col => {
        const items = tasks.filter(t => t.status === col.status)
        return (
          <div key={col.status}
            className="rounded-xl p-3 min-h-[12rem] transition-colors"
            style={{ background: over === col.status ? 'var(--tm-primary-soft)' : 'var(--tm-surface-2)', border: '1px solid var(--tm-border)' }}
            onDragOver={e => { if (canMove && dragging) { e.preventDefault(); setOver(col.status) } }}
            onDragLeave={() => setOver(o => o === col.status ? null : o)}
            onDrop={e => {
              e.preventDefault(); setOver(null)
              const t = tasks.find(x => x.id === dragging)
              if (t && t.status !== col.status) onMove(t.id, col.status)
              setDragging(null)
            }}>
            <div className="flex items-center gap-2 px-1 mb-3">
              <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
              <p className="text-sm font-medium text-fg">{col.label}</p>
              <span className="text-xs text-faint tabular-nums">{items.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {items.length === 0 && <p className="text-xs text-faint px-1 py-6 text-center">{canMove ? 'Drop a task here' : 'Nothing here'}</p>}
              {(expanded[col.status] ? items : items.slice(0, COLUMN_CAP)).map(t => {
                const locked = isLocked(t)
                const overdue = t.status !== 'Completed' && t.due_date && t.due_date < today
                return (
                  <div key={t.id}
                    draggable={canMove && !locked}
                    onDragStart={() => setDragging(t.id)}
                    onDragEnd={() => { setDragging(null); setOver(null) }}
                    className={`tm-card p-3 !rounded-lg ${canMove && !locked ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    style={{ opacity: dragging === t.id ? 0.5 : 1, backdropFilter: 'none' }}>
                    <div className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: severityDot(t.severity) }} title={`${t.severity || 'Low'} severity`} />
                      <Link href={`/tasks/${t.id}`} className="text-sm text-fg hover:underline flex-1 min-w-0" draggable={false}>{t.description}</Link>
                    </div>
                    {t.task_skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pl-4">
                        {t.task_skills.slice(0, 2).map((ts: any) => <span key={ts.skill_id} className="tm-chip !text-[11px] !py-0">{ts.skills?.skill_name}</span>)}
                        {t.task_skills.length > 2 && <span className="text-[11px] text-faint">+{t.task_skills.length - 2}</span>}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-2.5 pl-4">
                      <Avatars people={(assignees[t.id] || []).filter(a => a.status !== 'Completed' || t.status === 'Completed')} />
                      <span className="flex items-center gap-1.5">
                        {flags(t)}
                        {t.due_date && (
                          <span className="text-[11px] tabular-nums flex items-center gap-1" style={{ color: overdue ? 'var(--tm-rose)' : 'var(--tm-text-faint)' }}>
                            <Icon name="clock" size={11} /> {new Date(t.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )
              })}
              {items.length > COLUMN_CAP && (
                <button className="text-xs text-primary-text hover:underline py-1" onClick={() => setExpanded(x => ({ ...x, [col.status]: !x[col.status] }))}>
                  {expanded[col.status] ? 'Show fewer' : `Show ${items.length - COLUMN_CAP} more`}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Calendar: tasks placed on their due date, one month at a time. ─── */
export function TaskCalendar({ tasks }: { tasks: any[] }) {
  const now = new Date()
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const startPad = (first.getDay() + 6) % 7  // weeks start on Monday
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((startPad + days) / 7) * 7 }, (_, i) => {
    const d = i - startPad + 1
    return d >= 1 && d <= days ? new Date(month.getFullYear(), month.getMonth(), d) : null
  })
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayKey = key(now)
  const byDay: Record<string, any[]> = {}
  tasks.forEach(t => { if (t.due_date) (byDay[t.due_date] ||= []).push(t) })
  const undated = tasks.filter(t => !t.due_date).length
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="tm-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-fg">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        <div className="flex items-center gap-1">
          <button className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="Previous month" onClick={() => shift(-1)}><Icon name="arrowLeft" size={14} /></button>
          <button className="tm-btn tm-btn-ghost tm-btn-sm" onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>Today</button>
          <button className="tm-btn tm-btn-ghost tm-btn-icon" aria-label="Next month" onClick={() => shift(1)}><Icon name="arrowRight" size={14} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-px min-w-[44rem] rounded-lg overflow-hidden" style={{ background: 'var(--tm-border)' }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-[11px] text-faint px-2 py-1.5" style={{ background: 'var(--tm-surface-2)' }}>{d}</div>
          ))}
          {cells.map((d, i) => {
            const list = d ? byDay[key(d)] || [] : []
            const isToday = d && key(d) === todayKey
            return (
              <div key={i} className="min-h-[6.5rem] p-1.5 flex flex-col gap-1" style={{ background: d ? 'var(--tm-surface-1)' : 'var(--tm-bg-subtle)' }}>
                {d && (
                  <span className="text-[11px] tabular-nums self-start px-1.5 rounded-full"
                    style={isToday ? { background: 'var(--tm-primary)', color: 'var(--tm-primary-fg)' } : { color: 'var(--tm-text-faint)' }}>
                    {d.getDate()}
                  </span>
                )}
                {list.slice(0, 3).map(t => (
                  <Link key={t.id} href={`/tasks/${t.id}`} title={t.description}
                    className="text-[11px] truncate rounded px-1.5 py-0.5 flex items-center gap-1 hover:opacity-80"
                    style={{ background: 'var(--tm-surface-2)', color: t.status === 'Completed' ? 'var(--tm-text-faint)' : 'var(--tm-text)', textDecoration: t.status === 'Completed' ? 'line-through' : undefined }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: severityDot(t.severity) }} />
                    <span className="truncate">{t.description}</span>
                  </Link>
                ))}
                {list.length > 3 && <span className="text-[10px] text-faint px-1.5">+{list.length - 3} more</span>}
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[11px] text-faint mt-2">Tasks sit on their due date. Completed tasks are struck through.{undated ? ` ${undated} task${undated === 1 ? ' has' : 's have'} no due date.` : ''}</p>
    </div>
  )
}
