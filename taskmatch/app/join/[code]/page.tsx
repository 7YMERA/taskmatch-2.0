'use client'

/* An invite link: /join/<code>. Says which workspace and role it's for, then joins with one click.
   Not signed in yet: sign in or sign up first, and come straight back here. */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import axios from 'axios'
import { supabase, API, authHeaders } from '../../lib/supabase'
import { joinWorkspace } from '../../lib/workspace'
import { roleLabel } from '../../lib/role'
import { AuthShell } from '../../components/AuthShell'
import { Button, Icon } from '../../components/ui'

export default function Join() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [info, setInfo] = useState<{ workspace: string; role: string; valid: boolean } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace(`/signup?next=/join/${code}`); return }
      try {
        const res = await axios.get(`${API}/invites/${code}`, { headers: await authHeaders() })
        setInfo(res.data)
      } catch (e: unknown) {
        setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'This invite link doesn\'t work.')
      }
    })
  }, [code])

  const join = async () => {
    setBusy(true); setError('')
    try { await joinWorkspace(code) } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Couldn\'t join. Try again.')
      setBusy(false)
    }
  }

  const article = (r: string) => /^[aeiou]/i.test(roleLabel(r)) ? 'an' : 'a'

  return (
    <AuthShell
      title={info ? `Join ${info.workspace}` : error ? 'Invite link' : 'Checking your invite…'}
      sub={info ? `You've been invited to join as ${article(info.role)} ${roleLabel(info.role).toLowerCase()}.` : ''}
      footer={<Link href="/onboarding" className="hover:underline">Set up a workspace another way</Link>}>
      {info && info.valid && (
        <Button onClick={join} disabled={busy} className="w-full">{busy ? 'Joining…' : `Join ${info.workspace}`}</Button>
      )}
      {info && !info.valid && (
        <p className="text-sm text-muted flex gap-2"><Icon name="alert" size={16} /> This link has expired or was revoked. Ask the admin who sent it for a new one.</p>
      )}
      {error && <p className="text-sm flex gap-2" style={{ color: 'var(--tm-rose)' }} role="alert"><Icon name="alert" size={16} /> {error}</p>}
    </AuthShell>
  )
}
