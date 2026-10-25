'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { effectiveRole } from '../lib/role'
import { Badge, Card, EmptyState, Icon, PageHeader, Skeleton } from '../components/ui'

export default function Logs() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('')
  const [logs, setLogs] = useState<any[]>([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserEmail(session.user.email || '')
      setUserRole(effectiveRole(session))
      setReady(true)
    })
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    setLogs(data || [])
    setLoading(false)
  }

  const actionAccent = (action: string) => {
    if (action.includes('deleted') || action.includes('removed')) return 'rose' as const
    if (action.includes('completed')) return 'sky' as const
    if (action.includes('created') || action.includes('added') || action.includes('assigned')) return 'emerald' as const
    return 'violet' as const
  }

  // Filter by entity type + free-text search across actor, action, summary and details.
  const q = search.trim().toLowerCase()
  const shown = logs.filter(l => {
    if (filter !== 'all' && l.entity_type !== filter) return false
    if (!q) return true
    return [l.actor_email, l.action, l.summary, l.entity_type, l.details && JSON.stringify(l.details)]
      .some(v => (v || '').toString().toLowerCase().includes(q))
  })
  const entityTypes = Array.from(new Set(logs.map(l => l.entity_type).filter(Boolean))).sort()
  const filters = ['all', ...entityTypes]
  const countFor = (f: string) => f === 'all' ? logs.length : logs.filter(l => l.entity_type === f).length

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10 overflow-y-auto">
        <PageHeader title="Activity log"
          sub="Every action, attributed and time-stamped. Entries can't be edited or deleted." />

        {!ready ? (
          <Card className="p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} style={{ height: 14 }} />)}</Card>
        ) : userRole !== 'leader' ? (
          <Card className="max-w-lg">
            <EmptyState icon={<Icon name="lock" size={28} />} title="Leaders only"
              hint={`The activity log is visible to team leaders. You're signed in as ${userEmail} (student).`} />
          </Card>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
              <div className="relative w-full lg:max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-faint"><Icon name="search" size={16} /></span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search people, actions, details…" className="tm-input" style={{ paddingLeft: 36, paddingRight: 36 }} />
                {search && (
                  <button onClick={() => setSearch('')} aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 tm-btn tm-btn-quiet !p-1"><Icon name="x" size={14} /></button>
                )}
              </div>
              <div className="overflow-x-auto">
                <div className="tm-seg">
                  {filters.map(f => (
                    <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className="capitalize whitespace-nowrap">
                      {f}<span className="text-[11px] tabular-nums text-faint">{countFor(f)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <Card className="p-5 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} style={{ height: 14 }} />)}</Card>
            ) : shown.length === 0 ? (
              <Card>
                <EmptyState icon={<Icon name="list" size={28} />}
                  title={q || filter !== 'all' ? 'No matching activity' : 'No activity yet'}
                  hint={q || filter !== 'all' ? 'Try a different search or filter.' : 'Actions across the workspace will show up here.'} />
              </Card>
            ) : (
              <div className="tm-card overflow-hidden overflow-x-auto">
                <table className="tm-table">
                  <thead>
                    <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
                  </thead>
                  <tbody>
                    {shown.map(l => (
                      <tr key={l.id}>
                        <td className="whitespace-nowrap tabular-nums text-[13px]">{new Date(l.created_at).toLocaleString()}</td>
                        <td className="text-[13px]">
                          <span className="text-fg">{l.actor_email || 'system'}</span>
                          {l.actor_role && <span className="text-faint"> · {l.actor_role}</span>}
                        </td>
                        <td><Badge accent={actionAccent(l.action)}>{l.action}</Badge></td>
                        <td className="text-[13px]">{l.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
