'use client'

/* Getting Started — a short checklist for a fresh workspace so a new admin isn't staring at
   an empty dashboard. Each step reflects real data (people added? task created?) and links to
   where you do it. It hides itself once the basics are done, or when the admin dismisses it. */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, Icon, type IconName } from './ui'

const DISMISS_KEY = 'tm_getting_started_dismissed'

type Step = { id: string; label: string; done: boolean; href: string; cta: string; icon: IconName }

export default function GettingStarted({ peopleCount, taskCount, role }:
  { peopleCount: number; taskCount: number; role: string }) {
  const [dismissed, setDismissed] = useState(true)   // assume dismissed until we read storage (no flash)

  useEffect(() => {
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1') } catch { setDismissed(false) }
  }, [])

  // Only leaders set a workspace up; members just do their tasks.
  const isLeader = role === 'admin' || role === 'lead'
  if (!isLeader || dismissed) return null

  const steps: Step[] = [
    { id: 'people', label: 'Add your people', done: peopleCount > 0, href: '/people', cta: 'Add people', icon: 'users' },
    { id: 'task', label: 'Create your first task', done: taskCount > 0, href: '/tasks?new=1', cta: 'New task', icon: 'plus' },
    { id: 'invite', label: 'Invite your teammates', done: false, href: '/team', cta: 'Invite', icon: 'link' },
  ]
  const doneCount = steps.filter(s => s.done).length

  // Once people + at least one task exist, the workspace is "set up" — stop nudging.
  if (peopleCount > 0 && taskCount > 0) return null

  return (
    <Card tint="indigo" className="p-5 mb-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-fg">Getting started</p>
          <p className="text-[12px] text-faint mt-0.5">A few steps to set up your workspace. {doneCount} of {steps.length} done.</p>
        </div>
        <button onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* */ } }}
          aria-label="Dismiss getting started" className="tm-btn tm-btn-quiet tm-btn-icon shrink-0">
          <Icon name="x" size={15} />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {steps.map(s => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ background: 'var(--tm-surface-1)' }}>
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs"
              style={{
                background: s.done ? 'color-mix(in srgb, var(--tm-emerald) 20%, transparent)' : 'var(--tm-surface-2)',
                color: s.done ? 'var(--tm-emerald)' : 'var(--tm-text-faint)',
              }}>
              {s.done ? <Icon name="check" size={13} /> : <Icon name={s.icon} size={13} />}
            </span>
            <span className="flex-1 text-[13px]" style={{ color: s.done ? 'var(--tm-text-faint)' : 'var(--tm-text)', textDecoration: s.done ? 'line-through' : 'none' }}>
              {s.label}
            </span>
            {!s.done && (
              <Link href={s.href} className="tm-btn tm-btn-ghost shrink-0 text-[12px]">
                <Icon name={s.icon} size={13} /> {s.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
