'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Icon } from '../components/ui'
import { AuthShell, AuthBuffer } from '../components/AuthShell'

const CREATING_MSGS = ['Creating your account…', 'Setting up your workspace…', 'Getting things ready…', 'Almost there…']

// Where to go after signing in: ?next=/join/abc from an invite link, otherwise the dashboard.
function nextPath() {
  const n = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('next')
  return n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard'
}

export default function SignUp() {
  const router = useRouter()
  // Moving between sign in and sign up keeps ?next=, so an invite link still lands on its page.
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); router.push(path + window.location.search) }
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [step, setStep] = useState(0)

  // Cycle the status messages while the buffer screen is up.
  useEffect(() => {
    if (!creating) return
    const id = setInterval(() => setStep(s => Math.min(s + 1, CREATING_MSGS.length - 1)), 550)
    return () => clearInterval(id)
  }, [creating])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },  // role is set server-side (app_metadata); new accounts are members
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (data.session) {
      setCreating(true)                                   // show the buffer, then go
      setTimeout(() => router.push(nextPath()), 2400)
    } else {
      setDone(true)
      setLoading(false)
    }
  }

  // Buffer screen after a successful sign-up (auto-login), before landing on the dashboard.
  if (creating) {
    return <AuthBuffer title={`Welcome${name ? `, ${name.split(' ')[0]}` : ''}!`}
      message={CREATING_MSGS[step]} progress={(step + 1) / CREATING_MSGS.length} />
  }

  if (done) {
    return (
      <AuthShell title="Check your email" sub={`We sent a confirmation link to ${email}.`}>
        <div className="rounded-lg p-4 mb-6 flex gap-3 border border-line bg-subtle">
          <span className="shrink-0 text-primary-text"><Icon name="mail" size={18} /></span>
          <p className="text-sm text-muted">Confirm your address, then sign in. If email confirmation is off for this project, you can sign in right away.</p>
        </div>
        <Link href="/login" onClick={go("/login")}><Button className="w-full">Go to sign in</Button></Link>
      </AuthShell>
    )
  }

  const mismatch = !!confirmPassword && confirmPassword !== password

  return (
    <AuthShell title="Create your account" sub="Start matching work to skill in minutes."
      footer={<>Already have an account? <Link href="/login" onClick={go("/login")} className="font-medium text-primary-text hover:underline">Sign in</Link></>}>
      <form onSubmit={handleSignup} className="flex flex-col gap-4">
        <div>
          <label className="tm-label" htmlFor="name">Full name</label>
          <input id="name" value={name} onChange={e => setName(e.target.value)}
            placeholder="Your name" autoComplete="name" autoFocus className="tm-input" />
        </div>
        <div>
          <label className="tm-label" htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email" className="tm-input" />
        </div>
        <div>
          <label className="tm-label" htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 6 characters" autoComplete="new-password" className="tm-input" />
        </div>
        <div>
          <label className="tm-label" htmlFor="pw2">Confirm password</label>
          <input id="pw2" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your password" autoComplete="new-password" aria-invalid={mismatch} className="tm-input" />
          {mismatch && <p className="text-xs mt-1.5" style={{ color: 'var(--tm-rose)' }}>Passwords don&apos;t match yet.</p>}
        </div>

        {error && (
          <p role="alert" className="text-sm px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ color: 'var(--tm-rose)', background: 'color-mix(in srgb, var(--tm-rose) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--tm-rose) 25%, transparent)' }}>
            <Icon name="alert" size={15} /> {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full mt-1">
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-xs text-center text-faint">New accounts start as students. A leader can promote you later.</p>
      </form>
    </AuthShell>
  )
}
