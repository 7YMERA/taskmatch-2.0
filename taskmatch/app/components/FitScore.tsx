'use client'

/* The fit score (0 to 100) and what it is made of. The API works it out (taskmatch-api/matching.py)
   from skills, proven experience, availability and track record; these just show it the same way
   wherever people are ranked: People › Find a match, task recommendations, and New task. */

import { useState } from 'react'
import { Icon } from './ui'

export type FitFactor = { key: 'skills' | 'experience' | 'availability' | 'record'; label: string; points: number; max: number; detail: string }

// One colour per part, from the chart palette, so the stacked bar and the legend agree.
export const FACTOR_COLOR: Record<FitFactor['key'], string> = {
  skills: 'var(--tm-chart-1)', experience: 'var(--tm-chart-3)', availability: 'var(--tm-chart-2)', record: 'var(--tm-chart-4)',
}

export const fitTone = (score: number) =>
  score >= 75 ? 'var(--tm-emerald)' : score >= 55 ? 'var(--tm-chart-1)' : score >= 35 ? 'var(--tm-amber)' : 'var(--tm-text-faint)'
export const fitWord = (score: number) =>
  score >= 75 ? 'Excellent fit' : score >= 55 ? 'Good fit' : score >= 35 ? 'Possible' : 'Weak fit'

/** Circular score badge. */
export function FitRing({ score, size = 40 }: { score: number; size?: number }) {
  const r = (size - 5) / 2, c = 2 * Math.PI * r
  return (
    <span className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}
      title={`${fitWord(score)}: ${score} out of 100`} aria-label={`Fit score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tm-track)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={fitTone(score)} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      <span className={`absolute font-semibold tabular-nums text-fg ${size < 34 ? 'text-[10px]' : 'text-[12px]'}`}>{score}</span>
    </span>
  )
}

/** One thin bar split into the four parts, each as wide as the points it earned. */
export function FitBar({ factors }: { factors: FitFactor[] }) {
  return (
    <span className="flex h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--tm-track)' }} aria-hidden>
      {factors.map(f => <span key={f.key} style={{ width: `${f.points}%`, background: FACTOR_COLOR[f.key] }} />)}
    </span>
  )
}

/** The parts, one row each, with points and the reason. */
export function FitBreakdown({ factors }: { factors: FitFactor[] }) {
  return (
    <div className="flex flex-col gap-2">
      {factors.map(f => (
        <div key={f.key} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3">
          <span className="text-xs text-muted flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: FACTOR_COLOR[f.key] }} />{f.label}
          </span>
          <span className="flex flex-col gap-1 min-w-0">
            <span className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tm-track)' }}>
              <span className="block h-full rounded-full" style={{ width: `${(f.points / f.max) * 100}%`, background: FACTOR_COLOR[f.key] }} />
            </span>
            <span className="text-[11px] text-faint leading-snug">{f.detail}</span>
          </span>
          <span className="text-xs tabular-nums text-muted text-right">{Math.round(f.points)}/{f.max}</span>
        </div>
      ))}
    </div>
  )
}

/** Score + stacked bar + a "Why?" toggle that opens the breakdown. */
export function FitSummary({ score, factors, compact = false }: { score: number; factors?: FitFactor[]; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  if (score == null) return null
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium" style={{ color: fitTone(score) }}>{fitWord(score)}</span>
        {factors && <span className="flex-1 min-w-[4rem] max-w-[10rem]"><FitBar factors={factors} /></span>}
        {factors && !compact && (
          <button type="button" onClick={() => setOpen(!open)} className="text-[11px] text-faint hover:underline inline-flex items-center gap-0.5" aria-expanded={open}>
            Why? <span style={{ transform: open ? 'rotate(180deg)' : undefined, display: 'inline-flex' }}><Icon name="chevronDown" size={11} /></span>
          </button>
        )}
      </div>
      {open && factors && <div className="mt-3"><FitBreakdown factors={factors} /></div>}
    </div>
  )
}
