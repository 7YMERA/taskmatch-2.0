'use client'

/* Find a match: the heart of TaskMatch, on its own page. Say what the work needs (or pick an open
   task) and everyone is ranked by fit. It used to be the last tab on People (?view=find), where it
   was easy to miss; that link now redirects here. ?skill=<id> or ?task=<id> preselects the need. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import { supabase, API, authHeaders } from '../lib/supabase'
import { effectiveRole, can } from '../lib/role'
import Sidebar from '../components/Sidebar'
import MatchFinder from '../components/MatchFinder'
import PersonQuickView from '../components/PersonQuickView'
import { Icon, PageHeader, type IconName } from '../components/ui'

const STEPS: { icon: IconName; title: string; hint: string }[] = [
  { icon: 'check', title: 'Say what the work needs', hint: 'Pick skills and a level, or start from an open task.' },
  { icon: 'target', title: 'See who fits', hint: 'Everyone is scored out of 100, with the reasons.' },
  { icon: 'user', title: 'Choose someone', hint: 'Open their profile, or assign straight from the list.' },
]

export default function Match() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [skills, setSkills] = useState<{ id: string; skill_name: string }[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [wip, setWip] = useState<{ [id: string]: any }>({})
  const [wipLimit, setWipLimit] = useState(3)
  const [quickId, setQuickId] = useState<string | null>(null)
  const [start, setStart] = useState<{ skill: string; task: string } | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    setStart({ skill: q.get('skill') || '', task: q.get('task') || '' })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setRole(effectiveRole(session))
    })
    supabase.from('skills').select('*').then(({ data }) => setSkills(data || []))
    supabase.from('students').select('*, student_skills(skill_id, proficiency, skills(skill_name))')
      .then(({ data }) => setPeople(data || []))
    authHeaders().then(headers => axios.get(`${API}/wip`, { headers })).then(res => {
      const map: { [id: string]: any } = {}
      for (const s of res.data.students) map[s.student_id] = s
      setWip(map); setWipLimit(res.data.wip_limit ?? 3)
    }).catch(() => { /* workload just won't show in the side panel */ })
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Find a match" sub="Find the best person for a piece of work, ranked by skills, proven experience and who has time."
          actions={<Link href="/people" className="tm-btn tm-btn-ghost"><Icon name="users" size={16} /> Browse people</Link>} />

        <ol className="grid sm:grid-cols-3 gap-3 mb-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 rounded-xl border border-line p-3.5" style={{ background: 'var(--tm-surface-1)' }}>
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold"
                style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{s.title}</span>
                <span className="block text-xs text-faint mt-0.5">{s.hint}</span>
              </span>
            </li>
          ))}
        </ol>

        {start && (
          <MatchFinder skills={skills} canAssign={can(role, 'assign.others')} onOpenPerson={setQuickId}
            initialNeed={start.skill ? [{ skill_id: start.skill, min_proficiency: 1 }] : []} initialTaskId={start.task} />
        )}

        <PersonQuickView person={people.find(p => p.id === quickId) || null} wip={quickId ? wip[quickId] : undefined} wipLimit={wipLimit}
          showScores={can(role, 'insights.view')} groupColor={() => 'var(--tm-violet)'} onClose={() => setQuickId(null)} />
      </main>
    </div>
  )
}
