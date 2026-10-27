'use client'

/* Members & roles: everyone in this workspace, their role here, and whether they're linked to
   someone on the roster. Admins rename the workspace, send invite links, change roles and remove
   people; anyone can leave. The table at the bottom shows exactly what each role can do. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import Link from 'next/link'
import { supabase, API, authHeaders } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { effectiveRole, realRole, can, roleLabel, ROLES, PERMISSIONS, type Role } from '../lib/role'
import { toast, confirmDialog } from '../lib/ui'
import { cachedWorkspaces, fetchWorkspaces, inviteLink, leaveWorkspace } from '../lib/workspace'
import { Button, Card, EmptyState, Icon, PageHeader, Skeleton } from '../components/ui'

type Invite = { code: string; role: Role; expires_at: string; max_uses: number; uses?: number; valid: boolean }
type Account = { id: string; email: string; name?: string | null; role: Role; on_roster: boolean; created_at?: string | null; last_sign_in_at?: string | null }

const ROLE_COLOR: Record<Role, string> = { admin: 'var(--tm-chart-1)', lead: 'var(--tm-chart-3)', member: 'var(--tm-chart-6)', viewer: 'var(--tm-chart-4)' }
const ago = (iso?: string | null) => {
  if (!iso) return 'Never'
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString()
}
const until = (iso: string) => {
  const h = Math.round((Date.parse(iso) - Date.now()) / 3600000)
  return h <= 0 ? 'Expired' : h < 24 ? `${h} hour${h === 1 ? '' : 's'} left` : `${Math.round(h / 24)} days left`
}
const detail = (e: unknown, fallback: string) => (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback

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
  const [myId, setMyId] = useState('')
  const [wsName, setWsName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [invites, setInvites] = useState<Invite[]>([])
  const [inviteRole, setInviteRole] = useState<Role>('member')
  const [inviteDays, setInviteDays] = useState(7)
  const [busy, setBusy] = useState('')


  const loadInvites = async () => {
    try {
      const res = await axios.get(`${API}/workspaces/invites`, { headers: await authHeaders() })
      setInvites(res.data.invites || [])
    } catch { /* the accounts error below says what's wrong */ }
  }

  const rename = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = nameDraft.trim()
    if (!name || name === wsName) return
    setBusy('rename')
    try {
      await axios.patch(`${API}/workspaces/current`, { name }, { headers: await authHeaders() })
      setWsName(name)
      fetchWorkspaces().catch(() => {})   // refreshes the workspace menu's cache
      toast('Workspace renamed.', 'success')
    } catch (err) { toast(detail(err, 'Could not rename the workspace.'), 'error') }
    finally { setBusy('') }
  }

  const createInvite = async () => {
    setBusy('invite')
    try {
      const res = await axios.post(`${API}/workspaces/invites`, { role: inviteRole, days: inviteDays }, { headers: await authHeaders() })
      await loadInvites()
      copy(res.data.code, 'Invite link created and copied.')
    } catch (err) { toast(detail(err, 'Could not create the invite link.'), 'error') }
    finally { setBusy('') }
  }

  const copy = async (code: string, message = 'Invite link copied.') => {
    try { await navigator.clipboard.writeText(inviteLink(code)); toast(message, 'success') }
    catch { toast(inviteLink(code), 'info') }
  }

  const revoke = async (inv: Invite) => {
    const ok = await confirmDialog({
      title: 'Revoke this invite link?',
      message: 'Anyone who has it won\'t be able to join with it. People who already joined stay.',
      confirmLabel: 'Revoke link', danger: true,
    })
    if (!ok) return
    try {
      await axios.delete(`${API}/workspaces/invites/${inv.code}`, { headers: await authHeaders() })
      setInvites(list => list.filter(i => i.code !== inv.code))
      toast('Invite link revoked.', 'success')
    } catch (err) { toast(detail(err, 'Could not revoke the link.'), 'error') }
  }

  const remove = async (a: Account) => {
    const self = a.id === myId
    const ok = await confirmDialog({
      title: self ? `Leave ${wsName || 'this workspace'}?` : `Remove ${a.name || a.email} from ${wsName || 'the workspace'}?`,
      message: self
        ? 'You\'ll lose access straight away. An admin can invite you back.'
        : 'They lose access straight away. Their past work and the audit trail stay. You can invite them back later.',
      confirmLabel: self ? 'Leave workspace' : 'Remove', danger: true,
    })
    if (!ok) return
    setSaving(a.id)
    try {
      if (self) { await leaveWorkspace(a.id); return }
      await axios.delete(`${API}/workspaces/members/${a.id}`, { headers: await authHeaders() })
      setAccounts(list => list.filter(x => x.id !== a.id))
      toast(`${a.name || a.email} was removed.`, 'success')
    } catch (err) { toast(detail(err, self ? 'Could not leave the workspace.' : 'Could not remove them.'), 'error') }
    finally { setSaving(null) }
  }

  const load = async () => {
    try {
      const res = await axios.get(`${API}/accounts`, { headers: await authHeaders() })
      setAccounts(res.data.accounts || [])
      setError('')
    } catch (e) {
      setError(detail(e, 'Could not load members. Check the API is running and has its admin key.'))
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
    } catch (e) {
      toast(detail(e, 'Could not change the role.'), 'error')
    } finally { setSaving(null) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setMe(session.user.email || '')
      setMyId(session.user.id)
      setRole(effectiveRole(session))
      const showName = (w: ReturnType<typeof cachedWorkspaces>) => {
        const n = w?.workspaces.find(x => x.id === w.current)?.name || ''
        setWsName(n); setNameDraft(n)
      }
      showName(cachedWorkspaces())
      fetchWorkspaces().then(showName).catch(() => {})
      if (can(realRole(session), 'team.manage')) { load(); loadInvites() }
      else setLoading(false)
    })
  }, [])

  const q = query.trim().toLowerCase()
  const shown = accounts.filter(a => (roleFilter === 'all' || a.role === roleFilter) && (!q || `${a.email} ${a.name || ''}`.toLowerCase().includes(q)))
  const counts = Object.fromEntries(ROLES.map(r => [r.key, accounts.filter(a => a.role === r.key).length])) as Record<Role, number>
  const notOnRoster = accounts.filter(a => !a.on_roster && a.role !== 'viewer').length

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 sm:px-10 py-8 pt-20 md:pt-10">
        <PageHeader title="Members & roles"
          sub={loading || !accounts.length ? `Who's in ${wsName || 'this workspace'}, and what each of them can do.`
            : `${wsName ? `${wsName} · ` : ''}${accounts.length} member${accounts.length === 1 ? '' : 's'} · ${counts.admin} admin${counts.admin === 1 ? '' : 's'} · ${counts.lead} team lead${counts.lead === 1 ? '' : 's'}${notOnRoster ? ` · ${notOnRoster} not on the roster yet` : ''}`} />

        {role && !can(role, 'team.manage') ? (
          <Card className="max-w-lg p-6">
            <p className="text-sm font-medium text-fg flex items-center gap-2"><Icon name="building" size={16} /> {wsName || 'This workspace'}</p>
            <p className="text-sm text-muted mt-2">
              You&apos;re a {roleLabel(role).toLowerCase()} here, signed in as {me}. Only admins can see the member list, send invites and change roles.
            </p>
            <div className="mt-5 pt-4 border-t border-[var(--tm-border)] flex items-center justify-between gap-3">
              <p className="text-xs text-faint">Leaving removes your access to this workspace&apos;s people and tasks.</p>
              <Button variant="ghost" className="tm-btn-sm shrink-0" disabled={saving === myId}
                onClick={() => remove({ id: myId, email: me, role: role as Role, on_roster: false })}>Leave</Button>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4 mb-6">
              <Card className="p-5">
                <p className="text-sm font-medium text-fg flex items-center gap-2"><Icon name="building" size={16} /> Workspace</p>
                <p className="text-xs text-faint mb-4">Everyone here shares its people, projects and tasks. Other workspaces can&apos;t see any of it.</p>
                <form onSubmit={rename} className="flex gap-2">
                  <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} maxLength={80} aria-label="Workspace name" className="tm-input" />
                  <Button type="submit" variant="ghost" className="shrink-0" disabled={busy === 'rename' || !nameDraft.trim() || nameDraft.trim() === wsName}>Rename</Button>
                </form>
              </Card>

              <Card className="p-5">
                <p className="text-sm font-medium text-fg flex items-center gap-2"><Icon name="link" size={16} /> Invite links</p>
                <p className="text-xs text-faint mb-4">Anyone signed in who opens the link joins with the role you pick. Links stop working when they expire, reach 25 joins, or are revoked.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <select className="tm-select-sm" value={inviteRole} onChange={e => setInviteRole(e.target.value as Role)} aria-label="Role for people who join">
                    {ROLES.map(r => <option key={r.key} value={r.key}>Join as {r.label.toLowerCase()}</option>)}
                  </select>
                  <select className="tm-select-sm" value={inviteDays} onChange={e => setInviteDays(Number(e.target.value))} aria-label="How long the link works">
                    {[1, 7, 30].map(d => <option key={d} value={d}>Expires in {d} day{d === 1 ? '' : 's'}</option>)}
                  </select>
                  <Button className="tm-btn-sm ml-auto" onClick={createInvite} disabled={busy === 'invite'}>
                    <Icon name="plus" size={14} /> {busy === 'invite' ? 'Creating…' : 'Create link'}
                  </Button>
                </div>
                {invites.length === 0 ? (
                  <p className="text-[13px] text-faint py-2">No active links.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[var(--tm-border)]">
                    {invites.map(inv => (
                      <li key={inv.code} className="flex items-center gap-3 py-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROLE_COLOR[inv.role] }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-fg truncate font-mono">{inviteLink(inv.code).replace(/^https?:\/\//, '')}</p>
                          <p className="text-[11px] text-faint">
                            {roleLabel(inv.role)} · {inv.valid ? until(inv.expires_at) : 'No longer works'} · {inv.uses || 0} of {inv.max_uses} joined
                          </p>
                        </div>
                        {inv.valid && (
                          <button className="tm-btn tm-btn-quiet tm-btn-icon" onClick={() => copy(inv.code)} aria-label="Copy invite link" title="Copy link">
                            <Icon name="copy" size={15} />
                          </button>
                        )}
                        <button className="tm-btn tm-btn-quiet tm-btn-icon" onClick={() => revoke(inv)} aria-label="Revoke invite link" title="Revoke">
                          <Icon name="x" size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

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
                <p className="text-sm font-medium text-fg">Members</p>
                <span className="text-xs text-faint">{shown.length}{shown.length !== accounts.length ? ` of ${accounts.length}` : ''}</span>
                <div className="relative ml-auto w-full sm:w-72">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"><Icon name="search" size={15} /></span>
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email" aria-label="Search members" className="tm-input !pl-9" />
                </div>
              </div>
              {loading ? (
                <div className="flex flex-col gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} style={{ height: 44 }} />)}</div>
              ) : error ? (
                <EmptyState icon={<Icon name="alert" size={28} />} title="Couldn't load members" hint={error} />
              ) : shown.length === 0 ? (
                <EmptyState icon={<Icon name="users" size={28} />} title="No matching members" hint="Try another search or role." />
              ) : (
                <div className="overflow-x-auto -mx-5">
                  <table className="tm-table">
                    <thead><tr><th>Member</th><th>Role</th><th>On the roster</th><th>Last signed in</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
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
                              : <Link href="/people" className="text-primary-text hover:underline">Add to roster</Link>}
                          </td>
                          <td className="text-[13px] text-muted whitespace-nowrap">{ago(a.last_sign_in_at)}</td>
                          <td className="text-[13px] text-faint whitespace-nowrap">{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                          <td className="text-right">
                            <Button variant="quiet" className="tm-btn-sm" disabled={saving === a.id} onClick={() => remove(a)}>
                              {a.id === myId ? 'Leave' : 'Remove'}
                            </Button>
                          </td>
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
