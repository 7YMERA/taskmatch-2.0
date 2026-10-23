'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AmbientBackground, Button, Icon } from '../components/ui'
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

  const fillDemo = () => { setEmail('demo@taskmatch.app'); setPassword('taskmatch123') }

  /* ── Post-login buffer ── */
  if (signingIn) {
    return (
      <main className="relative min-h-screen grid place-items-center px-6" style={{ background: 'var(--tm-bg)' }}>
        <AmbientBackground />
        <div className="relative z-10 text-center tm-fade-up">
          <div className="mx-auto mb-8 w-20 h-20 relative">
            <div className="absolute inset-0 rounded-full border-4" style={{ borderColor: 'var(--tm-border)' }} />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-400 border-r-emerald-400 animate-spin" />
          </div>
          <h1 className="text-2xl mb-2">
            <span className="tm-wordmark">Welcome back{welcomeName ? `, ${welcomeName.split(' ')[0]}` : ''}</span>
          </h1>
          <p className="text-sm transition-opacity duration-300" style={{ color: 'var(--tm-text-muted)' }}>{SIGNIN_MSGS[step]}</p>
          <div className="w-60 h-1.5 rounded-full overflow-hidden mx-auto mt-6" style={{ background: 'var(--tm-surface-2)' }}>
            <div className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((step + 1) / SIGNIN_MSGS.length) * 100}%`, background: 'var(--tm-gradient-btn)' }} />
          </div>
        </div>
      </main>
    )
  }

  /* ── Single centered sign-in card ── */
  return (
    <main className="relative min-h-screen grid place-items-center px-4 py-10" style={{ background: 'var(--tm-bg)' }}>
      <AmbientBackground />

      <div className="absolute top-5 right-5 z-20"><ThemeToggle /></div>
      <Link href="/" className="absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 text-sm transition hover:opacity-80"
        style={{ color: 'var(--tm-text-faint)' }}>
        <Icon name="arrowRight" size={15} className="rotate-180" /> Home
      </Link>

      <div className="relative z-10 w-full max-w-[400px] tm-fade-up">
        {/* Logo + wordmark, centered above the card */}
        <div className="flex flex-col items-center mb-6">
          <svg width="52" height="52" viewBox="0 0 42 42" fill="none" aria-label="TaskMatch"
            className="drop-shadow-[0_4px_16px_rgba(99,102,241,0.45)] mb-3">
            <defs><linearGradient id="lg" x1="4" y1="4" x2="38" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366f1" /><stop offset="0.5" stopColor="#8b5cf6" /><stop offset="1" stopColor="#34d399" />
            </linearGradient></defs>
            <rect x="3" y="3" width="36" height="36" rx="11" fill="url(#lg)" />
            <line x1="15.5" y1="15.5" x2="26.5" y2="26.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.9" />
            <circle cx="15" cy="15" r="3.6" fill="#fff" /><rect x="22.5" y="22.5" width="7" height="7" rx="2.2" fill="#fff" />
          </svg>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--tm-text)' }}>Welcome back</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--tm-text-faint)' }}>Sign in to your TaskMatch workspace</p>
        </div>

        {/* The card */}
        <div className="tm-card p-7 sm:p-8">
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="tm-label" htmlFor="email">Email</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--tm-text-faint)' }}>
                  <Icon name="user" size={17} />
                </span>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoFocus
                  className="tm-input" style={{ paddingLeft: 40 }} />
              </div>
            </div>

            <div>
              <label className="tm-label" htmlFor="pw">Password</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--tm-text-faint)' }}>
                  <Icon name="lock" size={17} />
                </span>
                <input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="tm-input" style={{ paddingLeft: 40 }} />
              </div>
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--tm-rose)', background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.25)' }}>
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Demo credentials — one click to fill */}
          <button onClick={fillDemo} type="button"
            className="w-full mt-4 text-xs rounded-lg py-2.5 transition hover:opacity-100"
            style={{ border: '1px dashed var(--tm-border-strong)', color: 'var(--tm-text-muted)', background: 'var(--tm-surface-1)' }}>
            Use demo account&nbsp;·&nbsp;<span style={{ color: 'var(--tm-indigo)' }}>demo@taskmatch.app</span>
          </button>
        </div>

        <p className="text-sm mt-6 text-center" style={{ color: 'var(--tm-text-faint)' }}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" style={{ color: 'var(--tm-indigo)' }} className="hover:opacity-80 font-medium">Sign up</Link>
        </p>
      </div>
    </main>
  )
}
