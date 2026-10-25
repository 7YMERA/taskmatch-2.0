'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from './lib/supabase'
import Link from 'next/link'
import { AmbientBackground, Button, Card, Icon, Logo } from './components/ui'
import { ThemeToggle } from './lib/theme'

/* ─── Small building blocks ─── */

function NavBar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll(); window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    ['Product', '#features'], ['How it works', '#how'], ['Why TaskMatch', '#mission'], ["What's new", '#roadmap'],
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-200"
      style={{
        background: scrolled ? 'color-mix(in srgb, var(--tm-bg) 80%, transparent)' : 'transparent',
        backdropFilter: scrolled ? 'saturate(180%) blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--tm-border)' : '1px solid transparent',
      }}>
      <nav className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <a href="#top"><Logo size={26} /></a>

        <div className="hidden md:flex items-center gap-1">
          {links.map(([l, h]) => (
            <a key={h} href={h} className="text-sm px-3 py-1.5 rounded-md transition-colors text-muted hover:text-fg hover:bg-surface-2">{l}</a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="hidden sm:block"><Button variant="quiet" className="tm-btn-sm">Log in</Button></Link>
          <Link href="/signup"><Button className="tm-btn-sm">Get started</Button></Link>
          <button className="md:hidden ml-1 text-fg" aria-label="Menu" onClick={() => setMenuOpen(o => !o)}><Icon name="menu" /></button>
        </div>
      </nav>

      {menuOpen && (
        <div className="md:hidden px-5 pb-4 flex flex-col gap-1"
          style={{ background: 'var(--tm-bg)', borderBottom: '1px solid var(--tm-border)' }}>
          {links.map(([l, h]) => (
            <a key={h} href={h} onClick={() => setMenuOpen(false)} className="text-sm py-2 text-muted">{l}</a>
          ))}
          <Link href="/login" className="text-sm py-2 text-muted">Log in</Link>
        </div>
      )}
    </header>
  )
}

function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-28 scroll-mt-16 ${className}`}>
      {children}
    </section>
  )
}

function SectionHeading({ eyebrow, title, sub, center = true }: { eyebrow: string; title: React.ReactNode; sub?: string; center?: boolean }) {
  return (
    <div className={`mb-12 sm:mb-16 ${center ? 'text-center mx-auto' : ''} max-w-2xl`}>
      <p className="tm-eyebrow mb-3">{eyebrow}</p>
      <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-fg">{title}</h2>
      {sub && <p className="text-base sm:text-lg mt-4 text-muted leading-relaxed">{sub}</p>}
    </div>
  )
}

/* ─── Product preview: a static mock of the matching screen ─── */
function ProductPreview() {
  const rows = [
    { n: 'Rizzuansyah', s: 'React · SQL · API design', fit: 94, band: 'High', c: 'var(--tm-emerald)', wip: 1, top: true },
    { n: 'Siti Farhana', s: 'React · Figma', fit: 81, band: 'Average', c: 'var(--tm-amber)', wip: 2, top: false },
    { n: 'Eason Lim', s: 'SQL · Python', fit: 63, band: 'Learner', c: 'var(--tm-sky)', wip: 0, top: false },
  ]
  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="rounded-xl overflow-hidden text-left"
        style={{ background: 'var(--tm-bg-elev)', boxShadow: '0 40px 80px -24px rgba(0,0,0,0.35), 0 0 0 1px var(--tm-border)' }}>
        {/* window chrome */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-line bg-subtle">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--tm-border-strong)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--tm-border-strong)' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--tm-border-strong)' }} />
          <span className="ml-3 text-xs text-faint">Tasks / Build onboarding API</span>
        </div>
        <div className="grid md:grid-cols-[1fr_280px]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-base font-semibold text-fg">Build onboarding API</p>
                <p className="text-xs mt-0.5 text-faint">Needs React, SQL, API design · 8h estimate</p>
              </div>
              <span className="tm-badge" style={{ '--tm-badge-c': 'var(--tm-sky)' } as React.CSSProperties}>Open</span>
            </div>
            <p className="text-xs font-medium mb-2 text-muted">Best matches</p>
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.n} className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                  style={{ border: `1px solid ${r.top ? 'color-mix(in srgb, var(--tm-primary) 40%, var(--tm-border))' : 'var(--tm-border)'}`, background: r.top ? 'var(--tm-primary-soft)' : 'transparent' }}>
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold"
                    style={{ background: 'var(--tm-surface-3)', color: 'var(--tm-text-muted)' }}>{r.n.split(' ').map(x => x[0]).join('')}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-fg">{r.n}</p>
                    <p className="text-xs truncate text-faint">{r.s}</p>
                  </div>
                  <div className="hidden sm:block w-24">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--tm-track)' }}>
                      <div className="h-full rounded-full" style={{ width: `${r.fit}%`, background: 'var(--tm-primary)' }} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums w-9 text-right text-fg">{r.fit}</span>
                  <span className="tm-badge hidden sm:inline-flex" style={{ '--tm-badge-c': r.c } as React.CSSProperties}>{r.band}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs rounded-lg px-3 py-2.5 border border-line bg-subtle text-muted">
              <Icon name="sparkle" size={14} style={{ color: 'var(--tm-primary-text)' }} />
              Suggested pairing: <span className="font-medium text-fg">Rizzuansyah</span> + <span className="font-medium text-fg">Eason Lim</span> (mentor + learner)
            </div>
          </div>
          <div className="hidden md:block p-6 border-l border-line bg-subtle">
            <p className="text-xs font-medium mb-3 text-muted">Team workload</p>
            {[['Rizzuansyah', 1], ['Siti Farhana', 2], ['Eason Lim', 0], ['Aina Sofea', 3]].map(([n, w]) => (
              <div key={n as string} className="flex items-center gap-2 mb-2.5">
                <span className="text-xs w-24 truncate text-muted">{n}</span>
                <div className="flex-1 flex gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-2 flex-1 rounded-sm"
                      style={{ background: i < (w as number) ? ((w as number) >= 3 ? 'var(--tm-chart-5)' : (w as number) === 2 ? 'var(--tm-chart-4)' : 'var(--tm-chart-2)') : 'var(--tm-track)' }} />
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-6 pt-5 border-t border-line">
              <p className="text-xs font-medium text-muted">Avg. efficiency</p>
              <p className="text-3xl font-semibold tracking-tight mt-1 tabular-nums text-fg">0.86</p>
              <p className="text-xs mt-1" style={{ color: 'var(--tm-emerald)' }}>+12% this month</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

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
    return <div className="min-h-screen bg-canvas" />
  }

  const features = [
    { icon: 'target' as const, title: 'Skill-based matching', desc: 'Every task lists the skills it needs. TaskMatch ranks your people by fit and current workload, so the best available person rises to the top.' },
    { icon: 'users' as const, title: 'Mentor + learner pairing', desc: 'Pair a strong member with someone still learning. Work gets done and skills spread across the team.' },
    { icon: 'scale' as const, title: 'Workload limits', desc: 'A work-in-progress cap stops the same few people being overloaded while others sit idle.' },
    { icon: 'chart' as const, title: 'Performance scoring', desc: 'Completed work scores efficiency from committed vs. actual hours and builds each person’s track record.' },
    { icon: 'shield' as const, title: 'Tamper-proof audit log', desc: 'Every assignment, start and completion is recorded, attributed and time-stamped. Entries can’t be edited.' },
    { icon: 'lock' as const, title: 'Secure by default', desc: 'Row-level security, verified logins on every API call and rate limiting come built in.' },
  ]

  const steps = [
    { t: 'Add your people', d: 'Build a roster with each person’s skills and programme.' },
    { t: 'Describe the work', d: 'Create a task with the skills it needs and the hours you expect.' },
    { t: 'Assign the best fit', d: 'Pick from a ranked shortlist, with a balanced pairing suggested.' },
    { t: 'Track and improve', d: 'Completed work is scored and feeds the next match.' },
  ]

  const roadmap = [
    { tag: 'Shipped', c: 'var(--tm-emerald)', t: 'Row-level security and verified API', d: 'Every request is checked against the signed-in user.' },
    { tag: 'Shipped', c: 'var(--tm-emerald)', t: 'New design system with light and dark mode', d: 'A consistent, accessible interface across the whole app.' },
    { tag: 'In progress', c: 'var(--tm-amber)', t: 'Skill evidence', d: 'Skills backed by completed work, not just self-declaration.' },
    { tag: 'Planned', c: 'var(--tm-sky)', t: 'Integrations', d: 'Pull tasks in from the tools your team already uses.' },
  ]

  return (
    <div id="top" className="relative overflow-hidden bg-canvas text-fg">
      <NavBar />

      {/* ─── HERO ─── */}
      <div className="relative">
        <AmbientBackground />
        <Section className="!pt-32 sm:!pt-40 !pb-16 relative text-center">
          <div className="tm-fade-up max-w-3xl mx-auto">
            <a href="#roadmap" className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full mb-7 text-xs transition-colors border border-line bg-surface text-muted hover:text-fg">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>New</span>
              Light and dark mode, rebuilt from the ground up
              <Icon name="arrowRight" size={12} />
            </a>
            <h1 className="text-4xl sm:text-6xl font-semibold tracking-[-0.035em] leading-[1.05] mb-6 text-fg">
              Put the right people<br className="hidden sm:block" /> on the <span className="tm-accent-text">right work</span>.
            </h1>
            <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-9 text-muted leading-relaxed">
              TaskMatch ranks your team against every task by skill and workload, pairs strong members with learners,
              and keeps a record of who did what.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup"><Button className="!px-5 !py-3">Get started free <Icon name="arrowRight" size={16} /></Button></Link>
              <Link href="/login"><Button variant="ghost" className="!px-5 !py-3">Try the demo</Button></Link>
            </div>
            <p className="text-xs mt-4 text-faint">No credit card needed. Demo account included.</p>
          </div>
        </Section>
        <div className="relative px-5 sm:px-8 pb-8 tm-fade-up" style={{ animationDelay: '.1s' }}>
          <ProductPreview />
        </div>
      </div>

      {/* ─── FEATURES ─── */}
      <Section id="features">
        <SectionHeading eyebrow="Product" title="Everything you need to hand out work fairly"
          sub="Stop assigning by gut feel. TaskMatch makes skills and capacity visible, so every decision is backed by evidence." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 rounded-xl overflow-hidden border border-line" style={{ gap: 1, background: 'var(--tm-border)' }}>
          {features.map(f => (
            <div key={f.title} className="p-7 bg-surface">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-5 border border-line bg-subtle" style={{ color: 'var(--tm-primary-text)' }}>
                <Icon name={f.icon} size={18} />
              </div>
              <h3 className="font-semibold mb-2 text-fg">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ─── HOW IT WORKS ─── */}
      <div className="border-y border-line bg-subtle">
        <Section id="how">
          <SectionHeading eyebrow="How it works" title="From roster to results in four steps" />
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((s, i) => (
              <li key={s.t} className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums"
                    style={{ background: 'var(--tm-primary)', color: 'var(--tm-primary-fg)' }}>{i + 1}</span>
                  {i < steps.length - 1 && <span className="hidden lg:block flex-1 h-px" style={{ background: 'var(--tm-border-strong)' }} />}
                </div>
                <h3 className="font-semibold mb-1.5 text-fg">{s.t}</h3>
                <p className="text-sm leading-relaxed text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* ─── MISSION ─── */}
      <Section id="mission">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="tm-eyebrow mb-3">Why TaskMatch</p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight text-fg">
              Teams do their best work when the right person picks up the right task.
            </h2>
            <p className="text-base sm:text-lg mt-5 text-muted leading-relaxed">
              Most teams hand out work by gut feel. Skills stay invisible, the same few people get overloaded, and deadlines slip.
              TaskMatch started as a university final-year project to fix that, and has grown into a standalone product.
            </p>
          </div>
          <div className="grid gap-3">
            {[['Fair', 'Work is spread by capacity, not by who says yes first.', 'scale'], ['Visible', 'Every skill, assignment and score is on the record.', 'chart'], ['Evidence-led', 'Past results shape the next match.', 'target']].map(([t, d, ic]) => (
              <Card key={t} className="p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--tm-primary-soft)', color: 'var(--tm-primary-text)' }}>
                  <Icon name={ic as 'scale'} size={18} />
                </div>
                <div>
                  <p className="font-semibold text-fg">{t}</p>
                  <p className="text-sm mt-0.5 text-muted">{d}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── ROADMAP / WHAT'S NEW ─── */}
      <div className="border-t border-line">
        <Section id="roadmap">
          <SectionHeading eyebrow="What's new" title="Shipped recently, and what's next" />
          <div className="max-w-3xl mx-auto rounded-xl border border-line overflow-hidden bg-surface">
            {roadmap.map((r, i) => (
              <div key={i} className={`p-5 flex items-start gap-4 ${i ? 'border-t border-line' : ''}`}>
                <span className="tm-badge shrink-0 mt-0.5 w-24 justify-center" style={{ '--tm-badge-c': r.c } as React.CSSProperties}>{r.tag}</span>
                <div>
                  <p className="font-medium text-fg">{r.t}</p>
                  <p className="text-sm mt-0.5 text-muted">{r.d}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* ─── CTA ─── */}
      <Section className="!pt-0">
        <div className="relative rounded-2xl overflow-hidden px-6 py-14 sm:p-16 text-center"
          style={{ background: 'var(--tm-primary)' }}>
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, #fff 0, transparent 40%), radial-gradient(circle at 90% 100%, #fff 0, transparent 35%)' }} />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4" style={{ color: '#fff' }}>Ready to match work to skill?</h2>
            <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Create an account and build your first roster in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup"><button className="tm-btn !px-5 !py-3" style={{ background: '#fff', color: '#18181b' }}>Get started free</button></Link>
              <Link href="/login"><button className="tm-btn !px-5 !py-3" style={{ color: '#fff', border: '1px solid rgba(255,255,255,0.35)' }}>Log in</button></Link>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-line">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size={22} />
          <div className="flex gap-6 text-sm text-muted">
            <a href="#features" className="hover:text-fg transition-colors">Product</a>
            <a href="#how" className="hover:text-fg transition-colors">How it works</a>
            <a href="#roadmap" className="hover:text-fg transition-colors">What&apos;s new</a>
            <Link href="/login" className="hover:text-fg transition-colors">Log in</Link>
          </div>
          <span className="text-xs text-faint">© {new Date().getFullYear()} TaskMatch</span>
        </div>
      </footer>
    </div>
  )
}
