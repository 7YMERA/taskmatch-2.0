'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { AmbientBackground, Button, Card } from './components/ui'
import { ThemeToggle } from './lib/theme'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

/* ─── Small building blocks ─── */

function NavBar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll(); window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    ['Features', '#features'], ['How it works', '#how'],
    ['Mission', '#mission'], ['Team', '#team'], ["What's new", '#roadmap'],
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? 'color-mix(in srgb, var(--tm-bg) 82%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--tm-border)' : '1px solid transparent',
      }}>
      <nav className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2">
          <svg width="30" height="30" viewBox="0 0 42 42" fill="none" aria-label="TaskMatch">
            <defs><linearGradient id="nav" x1="4" y1="4" x2="38" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#6366f1" /><stop offset="0.5" stopColor="#8b5cf6" /><stop offset="1" stopColor="#34d399" />
            </linearGradient></defs>
            <rect x="3" y="3" width="36" height="36" rx="11" fill="url(#nav)" />
            <line x1="15.5" y1="15.5" x2="26.5" y2="26.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity="0.9" />
            <circle cx="15" cy="15" r="3.6" fill="#fff" /><rect x="22.5" y="22.5" width="7" height="7" rx="2.2" fill="#fff" />
          </svg>
          <span className="tm-wordmark text-lg">TaskMatch</span>
        </a>

        <div className="hidden md:flex items-center gap-7">
          {links.map(([l, h]) => (
            <a key={h} href={h} className="text-sm transition hover:opacity-100"
              style={{ color: 'var(--tm-text-muted)' }}>{l}</a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="hidden sm:block"><Button variant="ghost" className="!py-2 !px-4">Log in</Button></Link>
          <Link href="/signup"><Button className="!py-2 !px-4">Get started</Button></Link>
          <button className="md:hidden text-xl ml-1" style={{ color: 'var(--tm-text)' }}
            aria-label="Menu" onClick={() => setMenuOpen(o => !o)}>☰</button>
        </div>
      </nav>

      {menuOpen && (
        <div className="md:hidden px-5 pb-4 flex flex-col gap-1"
          style={{ background: 'color-mix(in srgb, var(--tm-bg) 95%, transparent)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--tm-border)' }}>
          {links.map(([l, h]) => (
            <a key={h} href={h} onClick={() => setMenuOpen(false)}
              className="text-sm py-2" style={{ color: 'var(--tm-text-muted)' }}>{l}</a>
          ))}
        </div>
      )}
    </header>
  )
}

function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-20 ${className}`}>
      {children}
    </section>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.2em] mb-3 font-medium" style={{ color: 'var(--tm-violet)' }}>{children}</p>
  )
}

/* ─── Feature visuals (reused mini-mocks) ─── */
const MatchMock = (
  <div className="space-y-2.5">
    {[['Rizzuansyah', 'high', 'var(--tm-emerald)', true], ['Siti Farhana', 'avg', 'var(--tm-amber)', false], ['Eason', 'learner', 'var(--tm-rose)', false]].map(([n, b, c, top]) => (
      <div key={n as string} className="flex items-center gap-3 rounded-xl px-4 py-2.5"
        style={{ border: `1px solid ${top ? 'rgba(167,139,250,0.5)' : 'var(--tm-border)'}`, background: top ? 'rgba(139,92,246,0.1)' : 'var(--tm-surface-1)' }}>
        <div className="w-8 h-8 rounded-full shrink-0" style={{ background: `color-mix(in srgb, ${c} 25%, transparent)` }} />
        <span className="text-sm flex-1" style={{ color: 'var(--tm-text)' }}>{n}</span>
        <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: `color-mix(in srgb, ${c} 15%, transparent)`, color: c as string }}>{b}</span>
      </div>
    ))}
  </div>
)
const ScoreMock = (
  <div className="text-center py-2">
    <div className="text-6xl font-bold" style={{ color: 'var(--tm-emerald)' }}>0.67</div>
    <div className="w-full h-2.5 rounded-full overflow-hidden mt-4" style={{ background: 'var(--tm-surface-2)' }}>
      <div className="h-full rounded-full" style={{ width: '67%', background: 'var(--tm-emerald)' }} />
    </div>
    <p className="text-xs mt-2" style={{ color: 'var(--tm-text-faint)' }}>8h committed · 4h actual</p>
  </div>
)
const AuditMock = (
  <div className="space-y-2">
    {['task.completed — Ahmad', 'assignment.assigned — Siti', 'group.created — Sprint Squad'].map(l => (
      <div key={l} className="flex items-center gap-2.5 text-xs rounded-lg px-3 py-2.5"
        style={{ background: 'var(--tm-surface-1)', border: '1px solid var(--tm-border)' }}>
        <span style={{ color: 'var(--tm-emerald)' }}>●</span>
        <span className="truncate" style={{ color: 'var(--tm-text-muted)' }}>{l}</span>
      </div>
    ))}
  </div>
)

export default function Landing() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { router.replace('/dashboard'); return }
      setChecking(false)
    })
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--tm-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--tm-text-faint)' }}>Loading…</p>
      </div>
    )
  }

  const features = [
    { icon: '⚡', title: 'Smart matching', desc: 'Rank people against a task’s required skills and current workload, then suggest a balanced strong + learner pairing — automatically.', accent: 'var(--tm-violet)', mock: MatchMock },
    { icon: '📊', title: 'Performance scoring', desc: 'Every completed task scores efficiency from committed vs actual hours, and rolls up into each person’s track record.', accent: 'var(--tm-emerald)', mock: ScoreMock },
    { icon: '🛡', title: 'Immutable audit log', desc: 'Every assignment, start and completion is recorded, attributed and time-stamped — and can never be edited or deleted.', accent: 'var(--tm-rose)', mock: AuditMock },
  ]

  const steps = [
    { n: '01', t: 'Add your people & skills', d: 'Build a roster with each person’s skills and programme.' },
    { n: '02', t: 'Create tasks with requirements', d: 'Describe a task, set the skills it needs and the hours you expect.' },
    { n: '03', t: 'Let TaskMatch rank the fit', d: 'See who fits best by skill and workload, with a pairing suggested.' },
    { n: '04', t: 'Track, score & learn', d: 'Completed work scores efficiency and feeds the next match.' },
  ]

  const team = [
    { name: 'Add your name', role: 'Founder & Engineering', c: 'var(--tm-indigo)' },
    { name: 'Teammate', role: 'Product & Design', c: 'var(--tm-emerald)' },
    { name: 'Teammate', role: 'Research', c: 'var(--tm-amber)' },
  ]

  const roadmap = [
    { tag: 'Shipped', c: 'var(--tm-emerald)', t: 'Token-based identity & validated API', d: 'Every action is verified against your real login — no spoofing.' },
    { tag: 'Shipped', c: 'var(--tm-emerald)', t: 'Design system + light / dark mode', d: 'A consistent, themeable interface across the whole app.' },
    { tag: 'In progress', c: 'var(--tm-amber)', t: 'Smarter skill evidence', d: 'Skills backed by completed work, not just self-declaration.' },
    { tag: 'Planned', c: 'var(--tm-sky)', t: 'Integrations', d: 'Pull tasks from the tools your team already uses.' },
  ]

  return (
    <div id="top" className="relative overflow-hidden" style={{ background: 'var(--tm-bg)', color: 'var(--tm-text)' }}>
      <NavBar />

      {/* ─── HERO ─── */}
      <div className="relative">
        <AmbientBackground />
        <Section className="!py-0 min-h-screen flex flex-col justify-center items-center text-center">
          <div className="tm-fade-up max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-6 text-xs"
              style={{ border: '1px solid var(--tm-border)', background: 'var(--tm-surface-1)', color: 'var(--tm-text-muted)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--tm-emerald)' }} /> The right people on the right work
            </div>
            <h1 className="text-5xl sm:text-7xl font-bold leading-[1.05] mb-6">
              Match skills to tasks,<br /><span className="tm-wordmark">not names to gaps.</span>
            </h1>
            <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-9" style={{ color: 'var(--tm-text-muted)' }}>
              TaskMatch ranks your team against each task by skill and workload, balances strong members with
              learners, and keeps an auditable record of who did what.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/signup"><Button className="!px-7 !py-3.5">Get started free</Button></Link>
              <a href="#features"><Button variant="ghost" className="!px-7 !py-3.5">See how it works</Button></a>
            </div>
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs flex flex-col items-center gap-1 animate-bounce" style={{ color: 'var(--tm-text-faint)' }}>
            <span>Scroll</span><span>↓</span>
          </div>
        </Section>
      </div>

      {/* ─── FEATURES ─── */}
      <Section id="features">
        <div className="text-center mb-14">
          <Eyebrow>Features</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold">Everything you need to allocate work well</h2>
        </div>
        <div className="space-y-20">
          {features.map((f, i) => (
            <div key={f.title} className={`grid lg:grid-cols-2 gap-10 items-center ${i % 2 ? 'lg:[direction:rtl]' : ''}`}>
              <div className="lg:[direction:ltr]">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-2xl font-semibold mb-3" style={{ color: f.accent }}>{f.title}</h3>
                <p className="text-base leading-relaxed max-w-md" style={{ color: 'var(--tm-text-muted)' }}>{f.desc}</p>
              </div>
              <Card className="p-6 lg:[direction:ltr] relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl" style={{ background: `color-mix(in srgb, ${f.accent} 22%, transparent)` }} />
                <div className="relative z-10">{f.mock}</div>
              </Card>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── HOW IT WORKS ─── */}
      <div style={{ background: 'var(--tm-surface-1)', borderTop: '1px solid var(--tm-border)', borderBottom: '1px solid var(--tm-border)' }}>
        <Section id="how">
          <div className="text-center mb-14">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold">Four steps, from roster to results</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {steps.map(s => (
              <Card key={s.n} hover className="p-6">
                <div className="text-2xl font-bold tm-wordmark mb-3">{s.n}</div>
                <h3 className="font-semibold mb-1.5" style={{ color: 'var(--tm-text)' }}>{s.t}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--tm-text-muted)' }}>{s.d}</p>
              </Card>
            ))}
          </div>
        </Section>
      </div>

      {/* ─── MISSION ─── */}
      <Section id="mission" className="text-center">
        <Eyebrow>Our mission</Eyebrow>
        <h2 className="text-3xl sm:text-5xl font-bold max-w-4xl mx-auto leading-tight mb-6">
          Teams do their best work when the <span className="tm-wordmark">right person</span> picks up the <span className="tm-wordmark">right task</span>.
        </h2>
        <p className="text-lg max-w-2xl mx-auto" style={{ color: 'var(--tm-text-muted)' }}>
          Most teams allocate work by gut feel — so skills stay invisible, the same few people get overloaded, and
          deadlines slip. TaskMatch makes skills and capacity visible, so allocation is fair, balanced, and based on evidence.
        </p>
        <div className="grid sm:grid-cols-3 gap-6 mt-14 max-w-3xl mx-auto">
          {[['Fair', 'Work spread by capacity, not by who says yes first.'], ['Visible', 'Every skill and score is on the record.'], ['Evidence-led', 'Past results shape the next match.']].map(([t, d]) => (
            <div key={t}>
              <p className="text-xl font-semibold mb-1" style={{ color: 'var(--tm-emerald)' }}>{t}</p>
              <p className="text-sm" style={{ color: 'var(--tm-text-muted)' }}>{d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── TEAM ─── */}
      <div style={{ background: 'var(--tm-surface-1)', borderTop: '1px solid var(--tm-border)', borderBottom: '1px solid var(--tm-border)' }}>
        <Section id="team">
          <div className="text-center mb-14">
            <Eyebrow>The team</Eyebrow>
            <h2 className="text-3xl sm:text-4xl font-bold">The people behind TaskMatch</h2>
            <p className="text-sm mt-3" style={{ color: 'var(--tm-text-faint)' }}>(edit these in <code>app/page.tsx</code>)</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {team.map((m, i) => (
              <Card key={i} hover className="p-7 text-center">
                <div className="w-20 h-20 rounded-full mx-auto mb-4" style={{ background: `color-mix(in srgb, ${m.c} 30%, transparent)`, border: `2px solid ${m.c}` }} />
                <p className="font-semibold text-lg" style={{ color: 'var(--tm-text)' }}>{m.name}</p>
                <p className="text-sm mt-1" style={{ color: m.c }}>{m.role}</p>
              </Card>
            ))}
          </div>
        </Section>
      </div>

      {/* ─── ROADMAP / WHAT'S NEW ─── */}
      <Section id="roadmap">
        <div className="text-center mb-14">
          <Eyebrow>What&apos;s new</Eyebrow>
          <h2 className="text-3xl sm:text-4xl font-bold">Shipped recently & what&apos;s next</h2>
        </div>
        <div className="max-w-3xl mx-auto space-y-4">
          {roadmap.map((r, i) => (
            <Card key={i} hover className="p-5 flex items-start gap-4">
              <span className="text-xs px-2.5 py-1 rounded-full shrink-0 mt-0.5"
                style={{ background: `color-mix(in srgb, ${r.c} 15%, transparent)`, color: r.c, border: `1px solid color-mix(in srgb, ${r.c} 35%, transparent)` }}>{r.tag}</span>
              <div>
                <p className="font-semibold" style={{ color: 'var(--tm-text)' }}>{r.t}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--tm-text-muted)' }}>{r.d}</p>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ─── CTA ─── */}
      <Section className="text-center">
        <Card className="p-12 sm:p-16 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.25)' }} />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full blur-3xl" style={{ background: 'rgba(52,211,153,0.18)' }} />
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to match work to skill?</h2>
            <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: 'var(--tm-text-muted)' }}>
              Create an account and build your first roster in minutes.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/signup"><Button className="!px-7 !py-3.5">Get started free</Button></Link>
              <Link href="/login"><Button variant="ghost" className="!px-7 !py-3.5">Log in</Button></Link>
            </div>
          </div>
        </Card>
      </Section>

      {/* ─── FOOTER ─── */}
      <footer style={{ borderTop: '1px solid var(--tm-border)' }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="tm-wordmark text-lg">TaskMatch</span>
          <div className="flex gap-6 text-sm" style={{ color: 'var(--tm-text-muted)' }}>
            <a href="#features" className="hover:opacity-80">Features</a>
            <a href="#mission" className="hover:opacity-80">Mission</a>
            <a href="#team" className="hover:opacity-80">Team</a>
            <Link href="/login" className="hover:opacity-80">Log in</Link>
          </div>
          <span className="text-xs" style={{ color: 'var(--tm-text-faint)' }}>© {new Date().getFullYear()} TaskMatch</span>
        </div>
      </footer>
    </div>
  )
}
