'use client'

/* Shared layout for the sign-in / sign-up screens: form on the left, a quiet
   product panel on the right (hidden on small screens). */

import Link from 'next/link'
import { Icon, Logo } from './ui'
import { ThemeToggle } from '../lib/theme'

export function AuthShell({ title, sub, children, footer }:
  { title: string; sub: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      <div className="flex flex-col px-6 sm:px-10 py-6">
        <div className="flex items-center justify-between">
          <Link href="/"><Logo size={26} /></Link>
          <ThemeToggle />
        </div>
        <div className="flex-1 grid place-items-center py-10">
          <div className="w-full max-w-[380px] tm-fade-up">
            <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
            <p className="text-sm mt-1.5 mb-8 text-muted">{sub}</p>
            {children}
            {footer && <div className="text-sm mt-8 text-center text-muted">{footer}</div>}
          </div>
        </div>
        <p className="text-xs text-faint">© {new Date().getFullYear()} TaskMatch</p>
      </div>

      <aside className="hidden lg:flex relative overflow-hidden flex-col justify-between p-12 border-l border-line bg-subtle">
        <div className="absolute inset-0 tm-grid-bg opacity-70" aria-hidden />
        <div className="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] rounded-full blur-3xl" style={{ background: 'var(--tm-primary-soft)' }} aria-hidden />
        <div className="relative" />
        <div className="relative max-w-md">
          <p className="text-3xl font-semibold tracking-tight leading-tight text-fg">
            The right people on the right work, every time.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              ['target', 'Ranked matches by skill and workload'],
              ['users', 'Mentor + learner pairing built in'],
              ['shield', 'A tamper-proof record of who did what'],
            ].map(([ic, t]) => (
              <li key={t} className="flex items-center gap-3 text-sm text-muted">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center border border-line bg-surface" style={{ color: 'var(--tm-primary-text)' }}>
                  <Icon name={ic as 'target'} size={16} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-faint">Skill-based task allocation for teams.</p>
      </aside>
    </main>
  )
}

/* Full-screen "getting things ready" buffer shown right after sign-in / sign-up. */
export function AuthBuffer({ title, message, progress }: { title: string; message: string; progress: number }) {
  return (
    <main className="min-h-screen grid place-items-center px-6 bg-canvas">
      <div className="text-center tm-fade-up">
        <div className="mx-auto mb-6 w-fit"><Logo size={40} withText={false} /></div>
        <h1 className="text-xl font-semibold tracking-tight mb-1.5 text-fg">{title}</h1>
        <p className="text-sm text-muted">{message}</p>
        <div className="w-56 h-1 rounded-full overflow-hidden mx-auto mt-6" style={{ background: 'var(--tm-track)' }}>
          <div className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress * 100}%`, background: 'var(--tm-primary)' }} />
        </div>
      </div>
    </main>
  )
}
