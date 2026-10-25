'use client'

/* Set up a workspace: start a new one (you become its admin) or join one with an invite link.
   New accounts land here; anyone can come back from the workspace menu to add another. */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { createWorkspace, fetchWorkspaces, inviteCodeFrom, joinWorkspace, type WorkspaceState } from '../lib/workspace'
import { AuthShell } from '../components/AuthShell'
import { Button, Field, Icon, Input } from '../components/ui'

type Mode = 'create' | 'join'

export default function Onboarding() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('create')
  const [ws, setWs] = useState<WorkspaceState | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login?next=/onboarding'); return }
      const m = new URLSearchParams(window.location.search).get('mode')
      if (m === 'join' || m === 'create') setMode(m)
      fetchWorkspaces().then(setWs).catch(() => setWs({ current: null, role: 'none', workspaces: [] }))
    })
  }, [])

  const first = ws !== null && ws.workspaces.length === 0
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      if (mode === 'create') await createWorkspace(name.trim())
      else await joinWorkspace(inviteCodeFrom(code))
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={first ? 'Set up your workspace' : mode === 'create' ? 'Create a workspace' : 'Join a workspace'}
      sub={first
        ? 'A workspace holds one team\'s people, projects and tasks. Start your own, or join your team\'s with an invite link.'
        : 'Each workspace has its own people, projects, tasks and roles.'}
      footer={ws && ws.workspaces.length > 0
        ? <Link href="/dashboard" className="font-medium text-primary-text hover:underline">Back to {ws.workspaces.find(w => w.id === ws.current)?.name || 'the app'}</Link>
        : <button type="button" onClick={async () => { await supabase.auth.signOut(); router.push('/login') }} className="hover:underline">Sign out</button>}>

      <div className="tm-seg w-full mb-6" role="group" aria-label="Create or join">
        {([['create', 'Start a new one', 'plus'], ['join', 'I have an invite', 'link']] as const).map(([k, label, icon]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => { setMode(k); setError('') }}
            className="flex-1 justify-center">
            <Icon name={icon} size={14} /> {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === 'create' ? (
          <>
            <Field label="Workspace name">
              <Input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80}
                placeholder="e.g. Acme Design Team" aria-describedby="ws-hint" />
            </Field>
            <p id="ws-hint" className="text-xs text-faint -mt-2">
              You&apos;ll be its admin. It starts with a common skill list you can change, and you can invite people once it&apos;s set up.
            </p>
            <Button type="submit" disabled={busy || !name.trim()} className="w-full">{busy ? 'Creating…' : 'Create workspace'}</Button>
          </>
        ) : (
          <>
            <Field label="Invite link or code">
              <Input autoFocus value={code} onChange={e => setCode(e.target.value)}
                placeholder="Paste the link your admin sent you" aria-describedby="join-hint" />
            </Field>
            <p id="join-hint" className="text-xs text-faint -mt-2">Ask an admin of the workspace for an invite link if you don&apos;t have one.</p>
            <Button type="submit" disabled={busy || inviteCodeFrom(code).length < 6} className="w-full">{busy ? 'Joining…' : 'Join workspace'}</Button>
          </>
        )}
        {error && <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--tm-rose)' }} role="alert"><Icon name="alert" size={14} /> {error}</p>}
      </form>
    </AuthShell>
  )
}
