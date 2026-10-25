'use client'

/* People › Team insights. The team as a whole: open tasks nobody available can take, which skills
   are at risk (a gap, or only one person who can do it), who could mentor each skill, and everyone's
   load in hours against their capacity. All from GET /people/insights. */

import Link from 'next/link'
import { Badge, Card, EmptyState, Icon, Skeleton } from './ui'

export type Insights = {
  wip_limit: number
  capacity_hours: number
  summary: { people: number; available: number; active_hours: number; capacity_hours: number; utilisation: number
             gaps: number; single_points: number; proven_share: number; hard_to_staff: number }
  people: { student_id: string; name: string; active_count: number; active_hours: number; load: number; away: boolean
            completed: number; on_time: number; dated: number; avg_score: number | null
            proven: { skill_id: string; skill_name: string; count: number; level: number; last: string | null; strength: number }[] }[]
  skills: { skill_id: string; skill_name: string; holders: number; advanced: number; proven: number; open_tasks: number
            needed_level: number | null; able: number; available: number; risk: 'gap' | 'single' | 'thin' | 'ok' | 'none'
            mentor: { student_id: string; name: string } | null }[]
  hard_to_staff: { task_id: string; description: string; due_date: string | null; missing: string[] }[]
}

const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced']
const RISK: Record<Insights['skills'][number]['risk'], { label: string; accent: 'rose' | 'amber' | 'sky' | 'emerald' | 'indigo'; hint: string }> = {
  gap: { label: 'Gap', accent: 'rose', hint: 'Open work needs it and nobody available has the level' },
  single: { label: 'One person', accent: 'amber', hint: 'Only one person has the level open work needs' },
  thin: { label: 'No expert', accent: 'sky', hint: 'Nobody is at Advanced yet' },
  ok: { label: 'Covered', accent: 'emerald', hint: 'Several people, at least one Advanced' },
  none: { label: 'Unused', accent: 'indigo', hint: 'Nobody has it and no open work needs it' },
}
const loadColor = (l: number) => l >= 1 ? 'var(--tm-rose)' : l >= 0.67 ? 'var(--tm-amber)' : 'var(--tm-emerald)'

export default function PeopleInsights({ data, onOpenPerson, onFindFor }: {
  data: Insights | null
  onOpenPerson: (id: string) => void
  onFindFor: (skillId: string) => void
}) {
  if (!data) return <div className="grid lg:grid-cols-2 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} style={{ height: 220 }} />)}</div>
  const risky = data.skills.filter(s => s.risk === 'gap' || s.risk === 'single')
  const shownSkills = data.skills.filter(s => s.risk !== 'none')

  return (
    <div className="flex flex-col gap-4">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Needs attention */}
        <Card className="p-5">
          <p className="text-sm font-medium text-fg flex items-center gap-2"><span style={{ color: 'var(--tm-amber)' }}><Icon name="alert" size={16} /></span> Needs attention</p>
          <p className="text-xs text-faint mt-0.5 mb-4">Work that can&apos;t be staffed today, and skills that rest on one person.</p>
          {data.hard_to_staff.length === 0 && risky.length === 0 ? (
            <p className="text-sm text-muted flex items-center gap-2"><span style={{ color: 'var(--tm-emerald)' }}><Icon name="check" size={15} /></span> Every open task has someone who can take it.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.hard_to_staff.slice(0, 5).map(t => (
                <div key={t.task_id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--tm-rose)' }} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/tasks/${t.task_id}`} className="text-sm text-fg hover:underline block truncate">{t.description}</Link>
                    <p className="text-[11px] text-faint">{t.missing.length ? `Nobody available has ${t.missing.join(', ')} at the level needed` : 'Nobody available has every skill it needs at once'}</p>
                  </div>
                </div>
              ))}
              {risky.filter(s => s.risk === 'single').slice(0, 4).map(s => (
                <div key={s.skill_id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--tm-amber)' }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">Only one person can do <span className="font-medium">{s.skill_name}</span>{s.needed_level ? ` at ${LEVELS[s.needed_level]}` : ''}</p>
                    <p className="text-[11px] text-faint">{s.open_tasks ? `${s.open_tasks} open task${s.open_tasks === 1 ? '' : 's'} need it. ` : ''}Pair someone with {s.mentor?.name || 'them'} to spread it.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Workload */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-fg flex items-center gap-2"><span className="text-primary-text"><Icon name="scale" size={16} /></span> Workload in hours</p>
            <span className="text-xs text-faint">capacity {data.capacity_hours}h each</span>
          </div>
          <p className="text-xs text-faint mt-0.5 mb-4">Hours on active tasks against each person&apos;s capacity. Whichever is tighter, hours or the {data.wip_limit}-task limit, sets the bar.</p>
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
            {data.people.map(p => (
              <button key={p.student_id} onClick={() => onOpenPerson(p.student_id)} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-3 text-left group">
                <span className="text-sm text-fg truncate group-hover:underline">{p.name}</span>
                <span className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--tm-track)' }}>
                  {p.away
                    ? <span className="block h-full w-full" style={{ background: 'repeating-linear-gradient(45deg, var(--tm-surface-3), var(--tm-surface-3) 4px, transparent 4px, transparent 8px)' }} />
                    : <span className="block h-full rounded-full" style={{ width: `${Math.min(p.load, 1) * 100}%`, background: loadColor(p.load) }} />}
                </span>
                <span className="text-[11px] tabular-nums text-right" style={{ color: p.away ? 'var(--tm-text-faint)' : p.load >= 1 ? 'var(--tm-rose)' : 'var(--tm-text-muted)' }}>
                  {p.away ? 'Away' : `${p.active_hours}h · ${p.active_count}/${data.wip_limit}`}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Skills health */}
      <Card className="p-5">
        <p className="text-sm font-medium text-fg flex items-center gap-2"><span className="text-primary-text"><Icon name="shield" size={16} /></span> Skills health</p>
        <p className="text-xs text-faint mt-0.5 mb-4">
          Supply against demand for every skill in use. <span className="inline-flex items-center gap-1" style={{ color: 'var(--tm-emerald)' }}><Icon name="check" size={11} strokeWidth={2.5} /> Proven</span> means
          used on finished work, not just declared ({Math.round(data.summary.proven_share * 100)}% of declared skills are proven so far).
        </p>
        {shownSkills.length === 0 ? <EmptyState icon={<Icon name="shield" size={28} />} title="No skills in use yet" hint="Add skills to people and tasks to see coverage." /> : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[40rem]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="font-medium py-2 px-1">Skill</th>
                  <th className="font-medium py-2 px-1">People</th>
                  <th className="font-medium py-2 px-1">Open work</th>
                  <th className="font-medium py-2 px-1">Status</th>
                  <th className="font-medium py-2 px-1">Best mentor</th>
                  <th className="py-2 px-1" />
                </tr>
              </thead>
              <tbody>
                {shownSkills.map(s => (
                  <tr key={s.skill_id} style={{ borderTop: '1px solid var(--tm-border)' }}>
                    <td className="py-2.5 px-1 text-fg font-medium">{s.skill_name}</td>
                    <td className="py-2.5 px-1 text-muted text-xs tabular-nums">
                      {s.holders} <span className="text-faint">· {s.advanced} advanced · </span>
                      <span style={{ color: s.proven ? 'var(--tm-emerald)' : undefined }}>{s.proven} proven</span>
                    </td>
                    <td className="py-2.5 px-1 text-xs text-muted">
                      {s.open_tasks ? <>{s.open_tasks} task{s.open_tasks === 1 ? '' : 's'} <span className="text-faint">· {LEVELS[s.needed_level || 1]}+ · {s.available} free</span></> : <span className="text-faint">—</span>}
                    </td>
                    <td className="py-2.5 px-1"><span title={RISK[s.risk].hint}><Badge accent={RISK[s.risk].accent} className="!text-[11px] !py-0">{RISK[s.risk].label}</Badge></span></td>
                    <td className="py-2.5 px-1 text-xs">
                      {s.mentor ? <button onClick={() => onOpenPerson(s.mentor!.student_id)} className="text-fg hover:underline">{s.mentor.name}</button> : <span className="text-faint">Nobody yet</span>}
                    </td>
                    <td className="py-2.5 px-1 text-right">
                      <button onClick={() => onFindFor(s.skill_id)} className="text-[11px] text-faint hover:underline whitespace-nowrap">Find people →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
