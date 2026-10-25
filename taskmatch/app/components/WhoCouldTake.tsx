'use client'

/* New task › "Who could take this?": as soon as skills are picked, the top people by fit score,
   so the lead sees if the task can be staffed before creating it. Read-only; assigning still
   happens on the task once it exists. */

import { useEffect, useState } from 'react'
import axios from 'axios'
import { API, authHeaders } from '../lib/supabase'
import { Icon } from './ui'
import { FitRing } from './FitScore'

export default function WhoCouldTake({ need, description }: {
  need: { skill_id: string; min_proficiency: number }[]
  description: string
}) {
  const [recs, setRecs] = useState<any[] | null>(null)
  const key = JSON.stringify(need) + '|' + description.trim()

  useEffect(() => {
    if (!need.length) return
    let live = true
    const t = setTimeout(async () => {   // wait for typing / clicking to settle
      try {
        const res = await axios.post(`${API}/match/people`, {
          skills: need.map(n => ({ skill_id: n.skill_id, min_level: n.min_proficiency })), description,
        }, { headers: await authHeaders() })
        if (live) setRecs(res.data.recommendations)
      } catch { if (live) setRecs([]) }
    }, 500)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!need.length || recs == null) return null
  const fit = recs.filter(r => r.qualified)
  return (
    <div className="rounded-xl border px-3 py-2.5 mb-4" style={{ borderColor: 'var(--tm-border)' }}>
      <p className="text-[13px] font-medium text-fg flex items-center gap-1.5 mb-2">
        <span className="text-primary-text"><Icon name="users" size={14} /></span> Who could take this?
        <span className="text-[11px] font-normal text-faint ml-auto">{fit.length} of {recs.length} meet every skill</span>
      </p>
      {fit.length === 0 ? (
        <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--tm-amber)' }}>
          <Icon name="alert" size={13} /> Nobody available meets every skill.
          {recs[0] && <span className="text-faint">Closest: {recs[0].name}{recs[0].mentor ? `, with ${recs[0].mentor.name} as a mentor` : ''}.</span>}
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {fit.slice(0, 3).map(r => (
            <span key={r.student_id} className="inline-flex items-center gap-2 text-sm text-fg" title={r.justification}>
              <FitRing score={r.fit_score} size={30} /> {r.name}
            </span>
          ))}
          {fit.length > 3 && <span className="text-xs text-faint self-center">+{fit.length - 3} more</span>}
        </div>
      )}
    </div>
  )
}
