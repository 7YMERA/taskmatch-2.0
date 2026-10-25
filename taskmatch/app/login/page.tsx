'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Icon } from '../components/ui'
import { AuthShell, AuthBuffer } from '../components/AuthShell'

const SIGNIN_MSGS = ['Signing you in…', 'Loading your workspace…', 'Almost there…']

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [welcomeName, setWelcomeName] = useState('')
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!signingIn) return
    const id = setInterval(() => setStep(s => Math.min(s + 1, SIGNIN_MSGS.length - 1)), 550)
    return () => clearInterval(id)
  }, [signingIn])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setWelcomeName(data.user?.user_metadata?.full_name || '')
      setSigningIn(true)
      setTimeout(() => router.push('/dashboard'), 1900)
    }
  }

  const fillDemo = () => { setEmail('demo@taskmatch.app'); setPassword('taskmatch123') }

  /* ── Post-login buffer ── */
  if (signingIn) {
    return <AuthBuffer title={`Welcome back${welcomeName ? `, ${welcomeName.split(' ')[0]}` : ''}`}
      message={SIGNIN_MSGS[step]} progress={(step + 1) / SIGNIN_MSGS.length} />
  }

  return (
    <AuthShell title="Welcome back" sub="Sign in to your TaskMatch workspace."
      footer={<>Don&apos;t have an account? <Link href="/signup" className="font-medium text-primary-text hover:underline">Sign up</Link></>}>
      <button onClick={fillDemo} type="button"
        className="w-full flex items-center gap-3 rounded-lg px-3.5 py-3 mb-6 text-left transition-colors border border-dashed border-line-strong bg-subtle hover:bg-surface-2">
        <span className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>
          <Icon name="sparkle" size={16} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg">Try the demo account</span>
          <span className="block text-xs truncate text-muted">Fills in demo@taskmatch.app for you</span>
        </span>
      </button>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div>
          <label className="tm-label" htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" autoComplete="email" autoFocus className="tm-input" />
        </div>
        <div>
          <label className="tm-label" htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Your password" autoComplete="current-password" className="tm-input" />
        </div>

        {error && (
          <p role="alert" className="text-sm px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ color: 'var(--tm-rose)', background: 'color-mix(in srgb, var(--tm-rose) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--tm-rose) 25%, transparent)' }}>
            <Icon name="alert" size={15} /> {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full mt-1">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
