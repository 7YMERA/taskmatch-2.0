'use client'

/* Suggestions for a new task: skills, hours and severity, each with a confidence level and a
   reason. They come from Claude when the API has a key, otherwise from the built-in engine that
   works from the team's finished tasks. Nothing is applied until the lead accepts it. The parent keeps the review (what was
   accepted or dismissed, at what confidence) and writes it to the audit trail with the task. */

import { useState } from 'react'
import axios from 'axios'
import { API, authHeaders } from '../lib/supabase'
import { Badge, Button, Icon } from './ui'

export type Confidence = 'high' | 'medium' | 'low'
type SkillSug = { skill_id: string; skill_name: string; min_level: number; confidence: Confidence; reason: string }
export type Suggestion = {
  skills: SkillSug[]
  hours: { estimate: number; low: number; high: number; confidence: Confidence; reason: string
           based_on: { task_id: string; description: string; actual_hours: number | null }[]; note?: string }
  severity: { value: string; confidence: Confidence; reason: string }
  question: string
  model: string
  examples_considered: number
}
export type AIReviewItem = { kind: 'skill' | 'hours' | 'severity'; value: string; confidence: Confidence; decision: 'accepted' | 'dismissed' }
export type AIReview = { model: string; items: AIReviewItem[] }

const LEVEL = ['', 'Beginner', 'Intermediate', 'Advanced']
const CONF: Record<Confidence, { label: string; accent: 'emerald' | 'amber' | 'sky'; bars: number }> = {
  high: { label: 'High confidence', accent: 'emerald', bars: 3 },
  medium: { label: 'Medium confidence', accent: 'amber', bars: 2 },
  low: { label: 'Low confidence', accent: 'sky', bars: 1 },
}

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const k = CONF[c]
  return (
    <Badge accent={k.accent} className="!text-[11px] shrink-0">
      <span className="inline-flex items-end gap-[2px] mr-1" aria-hidden>
        {[1, 2, 3].map(i => <span key={i} className="w-[3px] rounded-sm" style={{ height: 3 + i * 2, background: 'currentColor', opacity: i <= k.bars ? 1 : 0.25 }} />)}
      </span>
      {k.label}
    </Badge>
  )
}

export default function AISuggest({ description, notes, engine, canConfigure, onSkill, onHours, onSeverity, onReview }: {
  description: string
  notes?: string
  engine: 'claude' | 'history' | null   // null = still checking or unavailable
  canConfigure: boolean                 // admins see how to switch on AI
  onSkill: (skill_id: string, min_level: number) => void
  onHours: (hours: number) => void
  onSeverity: (severity: string) => void
  onReview: (review: AIReview | null) => void
}) {
  const [sug, setSug] = useState<Suggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [decided, setDecided] = useState<Record<string, 'accepted' | 'dismissed'>>({})

  if (engine === null) return null
  const isAI = engine === 'claude'

  const ready = description.trim().length >= 3

  const ask = async () => {
    setLoading(true); setError('')
    try {
      const res = await axios.post(`${API}/ai/suggest-task`, { description, notes: notes || '' }, { headers: await authHeaders() })
      setSug(res.data); setDecided({}); onReview({ model: res.data.model, items: [] })
    } catch (e) {
      const detail = axios.isAxiosError(e) ? e.response?.data?.detail : null
      setError(detail || 'The AI service didn\'t respond. Try again.')
    } finally { setLoading(false) }
  }

  // Turn the per-row decisions into the review the parent logs with the task.
  const commit = (next: Record<string, 'accepted' | 'dismissed'>) => {
    setDecided(next)
    if (!sug) return
    const items: AIReviewItem[] = []
    sug.skills.forEach(s => { const d = next[`skill:${s.skill_id}`]; if (d) items.push({ kind: 'skill', value: `${s.skill_name} (${LEVEL[s.min_level]}+)`, confidence: s.confidence, decision: d }) })
    if (next.hours) items.push({ kind: 'hours', value: `${sug.hours.estimate}h`, confidence: sug.hours.confidence, decision: next.hours })
    if (next.severity) items.push({ kind: 'severity', value: sug.severity.value, confidence: sug.severity.confidence, decision: next.severity })
    onReview({ model: sug.model, items })
  }
  const decide = (key: string, d: 'accepted' | 'dismissed') => commit({ ...decided, [key]: d })

  const acceptSkill = (s: SkillSug) => { onSkill(s.skill_id, s.min_level); decide(`skill:${s.skill_id}`, 'accepted') }
  const acceptHours = () => { if (!sug) return; onHours(sug.hours.estimate); decide('hours', 'accepted') }
  const acceptSeverity = () => { if (!sug) return; onSeverity(sug.severity.value); decide('severity', 'accepted') }

  const acceptAllHigh = () => {
    if (!sug) return
    const next = { ...decided }
    sug.skills.filter(s => s.confidence === 'high' && !next[`skill:${s.skill_id}`]).forEach(s => { onSkill(s.skill_id, s.min_level); next[`skill:${s.skill_id}`] = 'accepted' })
    if (sug.hours.confidence === 'high' && !next.hours) { onHours(sug.hours.estimate); next.hours = 'accepted' }
    if (sug.severity.confidence === 'high' && !next.severity) { onSeverity(sug.severity.value); next.severity = 'accepted' }
    commit(next)
  }

  const highLeft = sug ? [
    ...sug.skills.filter(s => s.confidence === 'high' && !decided[`skill:${s.skill_id}`]),
    ...(sug.hours.confidence === 'high' && !decided.hours ? [1] : []),
    ...(sug.severity.confidence === 'high' && !decided.severity ? [1] : []),
  ].length : 0

  const actions = (k: string, onAccept: () => void) => (
    decided[k] ? (
      <span className="text-[11px] text-faint inline-flex items-center gap-1 shrink-0">
        {decided[k] === 'accepted' ? <><Icon name="check" size={12} /> Used</> : 'Dismissed'}
      </span>
    ) : (
      <span className="flex items-center gap-1 shrink-0">
        <button type="button" className="tm-btn tm-btn-ghost tm-btn-sm !py-1 !px-2.5 !text-xs" onClick={onAccept}>Use</button>
        <button type="button" className="tm-btn tm-btn-quiet tm-btn-icon !w-7 !h-7" aria-label="Dismiss" title="Dismiss" onClick={() => decide(k, 'dismissed')}>
          <Icon name="x" size={12} />
        </button>
      </span>
    )
  )

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--tm-border)', background: 'var(--tm-surface-2, transparent)' }}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg">
          <span className="text-primary-text"><Icon name="sparkle" size={14} /></span> {isAI ? 'AI assist' : 'Smart suggestions'}
        </span>
        <span className="text-[11px] text-faint hidden sm:inline">Suggestions only. You decide what to use.</span>
        <Button variant={sug ? 'ghost' : 'primary'} className="!py-1 !px-3 !text-xs ml-auto" onClick={ask} disabled={!ready || loading}>
          {loading ? 'Thinking…' : sug ? 'Ask again' : 'Suggest'}
        </Button>
      </div>
      {!ready && !sug && <p className="text-[11px] text-faint px-3 pb-2.5 -mt-1">Type a description first.</p>}
      {error && <p className="text-xs px-3 pb-3 flex items-center gap-1.5" style={{ color: 'var(--tm-rose)' }}><Icon name="alert" size={13} /> {error}</p>}
      {loading && !sug && (
        <div className="px-3 pb-3 flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="tm-skeleton" style={{ height: 34 }} />)}</div>
      )}

      {sug && (
        <div className="border-t" style={{ borderColor: 'var(--tm-border)' }}>
          {sug.question && (
            <p className="text-xs px-3 pt-3 flex gap-1.5 text-muted">
              <span className="shrink-0 mt-[1px]"><Icon name="alert" size={13} /></span>
              <span><span className="text-fg font-medium">The description is vague.</span> {sug.question}</span>
            </p>
          )}

          <p className="text-[11px] font-medium text-faint uppercase tracking-wide px-3 pt-3 pb-1">Skills</p>
          {sug.skills.length === 0 && <p className="text-xs text-faint px-3 pb-2">No skills on your list fit this task.</p>}
          {sug.skills.map(s => (
            <div key={s.skill_id} className="flex items-start gap-2 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-fg flex flex-wrap items-center gap-x-2 gap-y-1">
                  {s.skill_name} <span className="text-faint text-xs">{LEVEL[s.min_level]}+</span>
                  <ConfidenceBadge c={s.confidence} />
                </p>
                <p className="text-[11px] text-faint leading-snug mt-0.5">{s.reason}</p>
              </div>
              {actions(`skill:${s.skill_id}`, () => acceptSkill(s))}
            </div>
          ))}

          <p className="text-[11px] font-medium text-faint uppercase tracking-wide px-3 pt-3 pb-1">Hours</p>
          <div className="flex items-start gap-2 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg flex flex-wrap items-center gap-x-2 gap-y-1">
                {sug.hours.estimate}h <span className="text-faint text-xs">likely {sug.hours.low}–{sug.hours.high}h</span>
                <ConfidenceBadge c={sug.hours.confidence} />
              </p>
              <p className="text-[11px] text-faint leading-snug mt-0.5">{sug.hours.reason}</p>
              <p className="text-[11px] text-faint leading-snug mt-0.5">
                {sug.hours.based_on.length
                  ? <>Based on {sug.hours.based_on.length} similar finished task{sug.hours.based_on.length === 1 ? '' : 's'}: {sug.hours.based_on.map(b => `${b.description}${b.actual_hours != null ? ` (${b.actual_hours}h)` : ''}`).join(', ')}</>
                  : 'No similar finished tasks yet, so this is a rough guess.'}
              </p>
              {sug.hours.note && <p className="text-[11px] leading-snug mt-1 flex items-start gap-1" style={{ color: 'var(--tm-amber)' }}><span className="shrink-0 mt-[1px]"><Icon name="clock" size={11} /></span>{sug.hours.note}</p>}
            </div>
            {actions('hours', acceptHours)}
          </div>

          <p className="text-[11px] font-medium text-faint uppercase tracking-wide px-3 pt-3 pb-1">Severity</p>
          <div className="flex items-start gap-2 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-fg flex flex-wrap items-center gap-x-2 gap-y-1">{sug.severity.value} <ConfidenceBadge c={sug.severity.confidence} /></p>
              <p className="text-[11px] text-faint leading-snug mt-0.5">{sug.severity.reason}</p>
            </div>
            {actions('severity', acceptSeverity)}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 mt-1 border-t" style={{ borderColor: 'var(--tm-border)' }}>
            <span className="text-[11px] text-faint">
              {isAI ? 'Suggested by AI from' : 'Worked out from'} your skill list and {sug.examples_considered} finished task{sug.examples_considered === 1 ? '' : 's'}. Check before creating.
              {!isAI && canConfigure && <> Add <code>ANTHROPIC_API_KEY</code> to the API for AI suggestions.</>}
            </span>
            {highLeft > 0 && <button type="button" className="tm-btn tm-btn-primary tm-btn-sm !py-1 !px-3 !text-xs ml-auto" onClick={acceptAllHigh}>Use all high confidence ({highLeft})</button>}
          </div>
        </div>
      )}
    </div>
  )
}
