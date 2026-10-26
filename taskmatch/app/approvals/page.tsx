'use client'

/* Approvals: requests that need a leader's yes/no before they take effect.
   A member taking a Critical task lands here; approving runs the action, rejecting drops it. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { supabase, API, authHeaders } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { effectiveRole, can, roleLabel } from '../lib/role'
import { Card, EmptyState, Icon, PageHeader, Skeleton } from '../components/ui'

type Approval = {
  id: string
  requested_by: string
  kind: string
  target_id: string | null
  payload: Record<string, unknown> | null
  status: string
  note: string | null
  created_at: string
}

const KIND_LABEL: Record<string, string> = {
  self_assign_critical: 'Take a critical task',
  reassign: 'Reassign a task',
  other: 'Request',
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function Approvals() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [me, setMe] = useState('')
  const [rows, setRows] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setMe(session.user.email || '')
      setRole(effectiveRole(session))
    })
  }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/approvals?status=pending`, { headers: await authHeaders() })
      setRows(res.data.approvals || [])
    } catch { /* stay quiet */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setBusy(id)
    try {
      await axios.post(`${API}/approvals/decide`, { approval_id: id, decision }, { headers: await authHeaders() })
      setRows(xs => xs.filter(x => x.id !== id))
    } catch { /* keep the card, let them retry */ } finally { setBusy(null) }
  }

  const leader = role && can(role, 'assign.others')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Approvals"
          sub="Requests waiting on your decision. Approving runs the action; rejecting drops it. Either way the person is notified." />

        {role && !leader ? (
          <Card className="max-w-lg">
            <EmptyState icon={<Icon name="lock" size={28} />} title="Admins and team leads only"
              hint={`Approvals are decided by admins and team leads. You're signed in as ${me} (${roleLabel(role)}).`} />
          </Card>
        ) : loading ? (
          <div className="flex flex-col gap-3 max-w-2xl">
            {Array.from({ length: 3 }).map((_, i) => <Card key={i} className="p-5"><Skeleton style={{ height: 48 }} /></Card>)}
          </div>
        ) : rows.length === 0 ? (
          <Card className="max-w-2xl">
            <EmptyState icon={<Icon name="inbox" size={28} />} title="Nothing to approve"
              hint="When a member requests something that needs sign-off — like taking a critical task — it shows up here." />
          </Card>
        ) : (
          <div className="flex flex-col gap-3 max-w-2xl">
            {rows.map(a => (
              <Card key={a.id} tint="amber" className="p-5 flex flex-wrap items-start gap-4">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'color-mix(in srgb, var(--tm-amber) 16%, transparent)', color: 'var(--tm-amber)' }}>
                  <Icon name="alert" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">{KIND_LABEL[a.kind] || a.kind}</p>
                  {a.note && <p className="text-[13px] text-muted mt-0.5">{a.note}</p>}
                  <p className="text-[11px] text-faint mt-1">Requested {timeAgo(a.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="tm-btn tm-btn-ghost" disabled={busy === a.id} onClick={() => decide(a.id, 'rejected')}>
                    <Icon name="x" size={14} /> Reject
                  </button>
                  <button className="tm-btn tm-btn-primary" disabled={busy === a.id} onClick={() => decide(a.id, 'approved')}>
                    <Icon name="check" size={14} /> {busy === a.id ? 'Saving…' : 'Approve'}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
