'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { AmbientBackground, Button, Badge } from './components/ui'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Landing() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { router.replace('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setActive(a => (a + 1) % 4), 3500)
    return () => clearInterval(id)
  }, [paused])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--tm-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--tm-text-faint)' }}>Loading…</p>
      </div>
    )
  }

  const MatchVisual = (
    <div className="w-full max-w-[400px] space-y-3">
      {[
        { n: 'Rizzuansyah', b: 'high', c: 'var(--tm-emerald)', top: true },
        { n: 'Siti Farhana', b: 'avg', c: 'var(--tm-amber)' },
        { n: 'Eason', b: 'learner', c: 'var(--tm-rose)' },
      ].map(r => (
        <div key={r.n} className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ border: `1px solid ${r.top ? 'rgba(167,139,250,0.5)' : 'var(--tm-border)'}`, background: r.top ? 'rgba(139,92,246,0.1)' : 'var(--tm-surface-1)' }}>
          <div className="w-10 h-10 rounded-full shrink-0" style={{ background: 'color-mix(in srgb, ' + r.c + ' 25%, transparent)' }} />
          <span className="text-sm flex-1" style={{ color: 'var(--tm-text)' }}>{r.n}</span>
          <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb,' + r.c + ' 15%, transparent)', color: r.c }}>{r.b}</span>
        </div>
      ))}
      <p className="text-xs text-center pt-2" style={{ color: 'var(--tm-violet)' }}>⚖️ balanced pair suggested</p>
    </div>
  )
  const ScoreVisual = (
    <div className="text-center">
      <div className="text-8xl font-bold leading-none" style={{ color: 'var(--tm-emerald)' }}>0.67</div>
      <p className="text-xs mb-4 mt-2" style={{ color: 'var(--tm-text-faint)' }}>efficiency score</p>
      <div className="w-72 h-3 rounded-full overflow-hidden mx-auto" style={{ background: 'var(--tm-surface-2)' }}>
        <div className="h-full rounded-full" style={{ width: '67%', background: 'var(--tm-emerald)' }} />
      </div>
      <p className="text-xs mt-3" style={{ color: 'var(--tm-text-faint)' }}>8h committed · 4h actual</p>
    </div>
  )
  const AuditVisual = (
    <div className="w-full max-w-[400px] space-y-2.5">
      {['task.completed — Ahmad (0.67)', 'assignment.assigned — Siti', 'group.created — Sprint Squad'].map(l => (
        <div key={l} className="flex items-center gap-2.5 text-xs rounded-lg px-3.5 py-2.5"
          style={{ background: 'var(--tm-surface-1)', border: '1px solid var(--tm-border)' }}>
          <span style={{ color: 'var(--tm-emerald)' }}>●</span>
          <span className="truncate" style={{ color: 'var(--tm-text-muted)' }}>{l}</span>
        </div>
      ))}
      <p className="text-xs text-center pt-2" style={{ color: 'var(--tm-rose)' }}>🔒 immutable — can&apos;t be edited or deleted</p>
    </div>
  )
  const GroupsVisual = (
    <div className="w-full max-w-[400px] space-y-4">
      {[{ g: 'Sprint Squad', c: 'var(--tm-sky)', m: 4 }, { g: 'Tak Tido Group', c: 'var(--tm-violet)', m: 3 }].map(grp => (
        <div key={grp.g} className="rounded-xl px-4 py-4"
          style={{ border: `1px solid color-mix(in srgb, ${grp.c} 35%, transparent)`, background: 'color-mix(in srgb,' + grp.c + ' 8%, transparent)' }}>
          <p className="text-xs mb-2.5" style={{ color: grp.c }}>{grp.g}</p>
          <div className="flex -space-x-2.5">
            {Array.from({ length: grp.m }).map((_, i) => (
              <div key={i} className="w-9 h-9 rounded-full" style={{ background: 'color-mix(in srgb,' + grp.c + ' 35%, transparent)', border: '2px solid var(--tm-bg)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  const SLIDES = [
    { key: 'match', icon: '⚡', title: 'Smart matching', desc: 'Rank students by skill fit and performance, with a balanced strong + learner pairing suggested automatically.', accent: 'var(--tm-violet)', visual: MatchVisual },
    { key: 'score', icon: '📊', title: 'Performance scoring', desc: 'Every completed task scores efficiency (committed vs actual hours) and rolls up into each student’s average.', accent: 'var(--tm-emerald)', visual: ScoreVisual },
    { key: 'audit', icon: '🛡', title: 'Immutable audit log', desc: 'Every action is recorded, attributed and time-stamped — and can never be edited or deleted.', accent: 'var(--tm-rose)', visual: AuditVisual },
    { key: 'groups', icon: '👥', title: 'Team groups', desc: 'Organise people and tasks into colour-coded groups — like departments within a project.', accent: 'var(--tm-sky)', visual: GroupsVisual },
  ]

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center" style={{ background: 'var(--tm-bg)' }}>
      <AmbientBackground />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-8 py-12 grid lg:grid-cols-5 gap-10 items-center">
        {/* LEFT — branding + actions */}
        <div className="lg:col-span-2 tm-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-xs"
            style={{ border: '1px solid var(--tm-border)', background: 'var(--tm-surface-1)', color: 'var(--tm-text-muted)' }}>
            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--tm-emerald)' }} /> Final Year Project · TaskMatch
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold mb-4"><span className="tm-wordmark">TaskMatch</span></h1>
          <p className="text-lg mb-2" style={{ color: 'var(--tm-text-muted)' }}>Skill-based task allocation for student teams.</p>
          <p className="text-sm mb-8 max-w-md" style={{ color: 'var(--tm-text-faint)' }}>
            Match the right people to the right tasks, track performance over time, and keep an auditable record of who did what.
          </p>
          <div className="flex items-center gap-3">
            <Link href="/login"><Button>Log in</Button></Link>
            <Link href="/signup"><Button variant="ghost">Sign up</Button></Link>
          </div>

          <div className="mt-10 pt-8 max-w-md" style={{ borderTop: '1px solid var(--tm-border)' }}>
            <p className="text-[11px] uppercase tracking-wider mb-3" style={{ color: 'var(--tm-text-faint)' }}>What it does</p>
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {[['⚡', 'Smart matching'], ['📊', 'Performance scoring'], ['🛡', 'Immutable audit log'], ['👥', 'Team groups']].map(([i, t]) => (
                <div key={t} className="flex items-center gap-2 text-xs" style={{ color: 'var(--tm-text-muted)' }}><span>{i}</span>{t}</div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — showcase */}
        <div className="lg:col-span-3 lg:pl-10" style={{ borderLeft: '1px solid var(--tm-border)' }}
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="relative h-[460px] sm:h-[520px] rounded-2xl overflow-hidden tm-card">
            <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl transition-colors duration-700"
              style={{ backgroundColor: 'color-mix(in srgb, ' + SLIDES[active].accent + ' 25%, transparent)' }} />
            {SLIDES.map((s, i) => (
              <div key={s.key}
                className={`absolute inset-0 p-7 sm:p-9 flex flex-col transition-all duration-700 ease-out ${i === active ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6 pointer-events-none'}`}>
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--tm-text-faint)' }}>
                  <span className="text-lg">{s.icon}</span><span>{`0${i + 1}`} / 04</span>
                </div>
                <div className="flex-1 flex items-center justify-center py-4">{s.visual}</div>
                <div>
                  <p className="text-xl font-semibold" style={{ color: s.accent }}>{s.title}</p>
                  <p className="text-sm mt-1.5 leading-relaxed" style={{ color: 'var(--tm-text-muted)' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-center mt-4 items-center">
            {SLIDES.map((s, i) => (
              <button key={s.key} onClick={() => setActive(i)} aria-label={s.title}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === active ? 26 : 8, backgroundColor: i === active ? s.accent : 'var(--tm-surface-3)' }} />
            ))}
            <span className="text-[10px] ml-2" style={{ color: 'var(--tm-text-faint)' }}>{paused ? '⏸ paused' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
