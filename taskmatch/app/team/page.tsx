'use client'

/* Team & roles: every login account, its role, and whether it's linked to someone on the
   roster. Admins change roles here; the table below shows exactly what each role can do. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import Link from 'next/link'
import { supabase, API, authHeaders } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { effectiveRole, realRole, can, roleLabel, ROLES, PERMISSIONS, type Role } from '../lib/role'
import { toast, confirmDialog } from '../lib/ui'
import { Card, EmptyState, Icon, PageHeader, Skeleton } from '../components/ui'

type Account = { id: string; email: string; name?: string | null; role: Role; on_roster: boolean; created_at?: string | null; last_sign_in_at?: string | null }

const ROLE_COLOR: Record<Role, string> = { admin: 'var(--tm-chart-1)', lead: 'var(--tm-chart-3)', member: 'var(--tm-chart-6)', viewer: 'var(--tm-chart-4)' }
const ago = (iso?: string | null) => {
  if (!iso) return 'Never'
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString()
}

export default function Team() {
  const router = useRouter()
  const [role, setRole] = useState<Role | ''>('')
  const [me, setMe] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setMe(session.user.email || '')
      setRole(effectiveRole(session))
      if (can(realRole(session), 'team.manage')) load()
      else setLoading(false)
    })
  }, [])

  const load = async () => {
    try {
      const res = await axios.get(`${API}/accounts`, { headers: await authHeaders() })
      setAccounts(res.data.accounts || [])
      setError('')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load accounts. Check the API is running and has its admin key.')
    } finally { setLoading(false) }
  }

  const changeRole = async (a: Account, next: Role) => {
    if (next === a.role) return
    const info = ROLES.find(r => r.key === next)!
    const ok = await confirmDialog({
      title: `Make ${a.name || a.email} ${/^[aeiou]/i.test(info.label) ? 'an' : 'a'} ${info.label}?`,
      message: `${info.description}\n\nThe change applies straight away.`,
      confirmLabel: `Make ${info.label}`, danger: a.role === 'admin',
    })
    if (!ok) return
    setSaving(a.id)
    try {
      await axios.post(`${API}/set-role`, { user_id: a.id, role: next }, { headers: await authHeaders() })
      setAccounts(list => list.map(x => x.id === a.id ? { ...x, role: next } : x))
      toast(`${a.name || a.email} is now ${roleLabel(next)}.`, 'success')
    } catch (e: any) {
      toast(e?.response?.data?.detail || 'Could not change the role.', 'error')
    } finally { setSaving(null) }
  }

  const q = query.trim().toLowerCase()
  const shown = accounts.filter(a => (roleFilter === 'all' || a.role === roleFilter) && (!q || `${a.email} ${a.name || ''}`.toLowerCase().includes(q)))
  const counts = Object.fromEntries(ROLES.map(r => [r.key, accounts.filter(a => a.role === r.key).length])) as Record<Role, number>
  const notOnRoster = accounts.filter(a => !a.on_roster && a.role !== 'viewer').length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Team & roles"
          sub={loading || !accounts.length ? 'Who can sign in, and what each of them can do.'
            : `${accounts.length} accounts · ${counts.admin} admin${counts.admin === 1 ? '' : 's'} · ${counts.lead} team lead${counts.lead === 1 ? '' : 's'}${notOnRoster ? ` · ${notOnRoster} not on the roster yet` : ''}`} />

        {role && !can(role, 'team.manage') ? (
          <Card className="max-w-lg">
            <EmptyState icon={<Icon name="lock" size={28} />} title="Admins only"
              hint={`Only admins can see and change roles. You're signed in as ${me} (${roleLabel(role)}).`} />
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {ROLES.map(r => (
                <button key={r.key} onClick={() => setRoleFilter(roleFilter === r.key ? 'all' : r.key)} aria-pressed={roleFilter === r.key}
                  className="tm-card p-4 text-left transition hover:border-[var(--tm-border-strong)]"
                  style={roleFilter === r.key ? { borderColor: 'var(--tm-primary)' } : undefined}>
                  <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
                    <span className="w-2 h-2 rounded-full" style={{ background: ROLE_COLOR[r.key] }} />{r.label}
                  </span>
                  <span className="block text-2xl font-semibold tabular-nums text-fg mt-1">{loading ? '…' : counts[r.key]}</span>
                  <span className="block text-[11px] text-faint mt-1 leading-snug">{r.description}</span>
                </button>
              ))}
            </div>

            <Card className="p-5 mb-6">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <p className="text-sm font-medium text-fg">Accounts</p>
                <span className="text-xs text-faint">{shown.length}{shown.length !== accounts.length ? ` of ${accounts.length}` : ''}</span>
                <div className="relative ml-auto w-full sm:w-72">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" size={15} /></span>
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email" aria-label="Search accounts" className="tm-input !pl-9" />
                </div>
              </div>
              {loading ? (
                <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} style={{ height: 44 }} />)}</div>
              ) : error ? (
                <EmptyState icon={<Icon name="alert" size={28} />} title="Couldn't load accounts" hint={error} />
              ) : shown.length === 0 ? (
                <EmptyState icon={<Icon name="users" size={28} />} title="No matching accounts" hint="Try another search or role." />
              ) : (
                <div className="overflow-x-auto -mx-5">
                  <table className="tm-table">
                    <thead><tr><th>Account</th><th>Role</th><th>On the roster</th><th>Last signed in</th><th>Joined</th></tr></thead>
                    <tbody>
                      {shown.map(a => (
                        <tr key={a.id}>
                          <td>
                            <p className="text-sm text-fg">{a.name || a.email.split('@')[0]}{a.email === me && <span className="text-[11px] text-faint"> (you)</span>}</p>
                            <p className="text-xs text-faint">{a.email}</p>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLOR[a.role] }} />
                              <select className="tm-select-sm" value={a.role} disabled={saving === a.id} aria-label={`Role for ${a.email}`}
                                onChange={e => changeRole(a, e.target.value as Role)}>
                                {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="text-[13px]">
                            {a.on_roster ? <span className="text-muted inline-flex items-center gap-1"><Icon name="check" size={13} /> Yes</span>
                              : a.role === 'viewer' ? <span className="text-faint">Not needed</span>
                              : <Link href="/students" className="text-primary-text hover:underline">Add to roster</Link>}
                          </td>
                          <td className="text-[13px] text-muted whitespace-nowrap">{ago(a.last_sign_in_at)}</td>
                          <td className="text-[13px] text-faint whitespace-nowrap">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-5">
              <p className="text-sm font-medium text-fg">What each role can do</p>
              <p className="text-xs text-faint mb-4">The API and the database check these too, so hiding a button is never the only protection.</p>
              <div className="overflow-x-auto -mx-5">
                <table className="tm-table">
                  <thead>
                    <tr><th>Permission</th>{ROLES.map(r => <th key={r.key} className="text-center">{r.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map(p => (
                      <tr key={p.key}>
                        <td className="text-[13px] text-fg">{p.label}</td>
                        {ROLES.map(r => (
                          <td key={r.key} className="text-center">
                            {p.roles.includes(r.key)
                              ? <span className="inline-flex text-fg" aria-label="Allowed"><Icon name="check" size={15} strokeWidth={2.4} /></span>
                              : <span className="text-faint" aria-label="Not allowed">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
