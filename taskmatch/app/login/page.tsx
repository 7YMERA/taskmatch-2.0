'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AmbientBackground, Button, Input, Field } from '../components/ui'
import { ThemeToggle } from '../lib/theme'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

  if (signingIn) {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--tm-bg)' }}>
        <AmbientBackground />
        <div className="relative z-10 text-center tm-fade-up">
          <div className="mx-auto mb-8 w-20 h-20 relative">
            <div className="absolute inset-0 rounded-full border-4" style={{ borderColor: 'var(--tm-border)' }} />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-400 border-r-emerald-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-2xl">👋</div>
          </div>
          <h1 className="text-2xl mb-2">
            <span className="tm-wordmark">Welcome back{welcomeName ? `, ${welcomeName.split(' ')[0]}` : ''}!</span>
          </h1>
          <p className="text-sm transition-opacity duration-300" style={{ color: 'var(--tm-text-muted)' }}>{SIGNIN_MSGS[step]}</p>
          <div className="w-60 h-1.5 rounded-full overflow-hidden mx-auto mt-6" style={{ background: 'var(--tm-surface-2)' }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / SIGNIN_MSGS.length) * 100}%`, background: 'var(--tm-gradient-btn)' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen grid lg:grid-cols-2" style={{ background: 'var(--tm-bg)' }}>
      <AmbientBackground />

      <div className="absolute top-5 right-5 z-20"><ThemeToggle /></div>

      {/* LEFT — brand panel (hidden on mobile) */}
      <div className="relative z-10 hidden lg:flex flex-col justify-between p-12">
        <Link href="/" className="text-sm transition hover:opacity-80" style={{ color: 'var(--tm-text-faint)' }}>← Home</Link>
        <div className="tm-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-xs"
            style={{ border: '1px solid var(--tm-border)', background: 'var(--tm-surface-1)', color: 'var(--tm-text-muted)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--tm-emerald)' }} /> Skill-based task allocation
          </div>
          <h1 className="text-5xl font-bold leading-tight mb-4">
            <span className="tm-wordmark">TaskMatch</span>
          </h1>
          <p className="text-lg max-w-sm" style={{ color: 'var(--tm-text-muted)' }}>
            The right people on the right tasks — matched by skill, balanced by workload.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {['⚡ Smart matching', '📊 Performance scoring', '🛡 Audit log', '👥 Team groups'].map(t => (
              <span key={t} className="text-xs px-3 py-1.5 rounded-full"
                style={{ border: '1px solid var(--tm-border)', background: 'var(--tm-surface-1)', color: 'var(--tm-text-muted)' }}>{t}</span>
            ))}
          </div>
        </div>
        <p className="text-xs" style={{ color: 'var(--tm-text-faint)' }}>Match people to work by skill, not by guesswork.</p>
      </div>

      {/* RIGHT — sign-in card */}
      <div className="relative z-10 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm tm-card p-8 tm-fade-up">
          <Link href="/" className="text-xs lg:hidden transition hover:opacity-80" style={{ color: 'var(--tm-text-faint)' }}>← Home</Link>
          <div className="mt-2 mb-7">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--tm-text)' }}>Welcome back</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--tm-text-faint)' }}>Sign in to continue to your workspace.</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoFocus />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" />
            </Field>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--tm-rose)', background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)' }}>
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full mt-1">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-xs mt-6 text-center" style={{ color: 'var(--tm-text-faint)' }}>
            Don&apos;t have an account?{' '}
            <Link href="/signup" style={{ color: 'var(--tm-indigo)' }} className="hover:opacity-80">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
