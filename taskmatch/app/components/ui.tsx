'use client'

/* TaskMatch design-system primitives.
   Import these instead of copy-pasting Tailwind. One definition, used everywhere. */

import React from 'react'

type Accent = 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky'

const ACCENT: Record<Accent, string> = {
  indigo: '#6366f1', violet: '#8b5cf6', emerald: '#34d399',
  amber: '#fbbf24', rose: '#fb7185', sky: '#38bdf8',
}

/* ─── Ambient glow background (landing / auth screens) ─── */
export function AmbientBackground({ animate = true }: { animate?: boolean }) {
  const anim = animate ? 'tm-drift 14s ease-in-out infinite' : undefined
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl"
        style={{ background: 'rgba(99,102,241,0.22)', animation: anim }} />
      <div className="absolute top-1/3 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl"
        style={{ background: 'rgba(139,92,246,0.20)', animation: animate ? 'tm-drift 18s ease-in-out infinite reverse' : undefined }} />
      <div className="absolute bottom-0 left-1/3 w-80 h-80 rounded-full blur-3xl"
        style={{ background: 'rgba(52,211,153,0.12)', animation: animate ? 'tm-float 10s ease-in-out infinite' : undefined }} />
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
    </div>
  )
}

/* ─── Button ─── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger'
}
export function Button({ variant = 'primary', className = '', ...rest }: BtnProps) {
  return <button className={`tm-btn tm-btn-${variant} ${className}`} {...rest} />
}

/* ─── Card ─── */
export function Card({ hover = false, className = '', style, children }:
  { hover?: boolean; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`tm-card ${hover ? 'tm-card-hover' : ''} ${className}`} style={style}>
      {children}
    </div>
  )
}

/* ─── Badge ─── */
export function Badge({ accent = 'indigo', children, className = '' }:
  { accent?: Accent; children: React.ReactNode; className?: string }) {
  const c = ACCENT[accent]
  return (
    <span className={`tm-badge ${className}`} style={{ background: c + '22', color: c, borderColor: c + '40' }}>
      {children}
    </span>
  )
}

/* Map a performance band to an accent colour — used across dashboard, tasks, students */
export function bandAccent(band: string): Accent {
  switch (band) {
    case 'high': return 'emerald'
    case 'avg': return 'amber'
    case 'low': return 'rose'
    case 'learner': return 'rose'
    default: return 'sky'
  }
}

/* ─── Input + Label ─── */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props
  return <input className={`tm-input ${className}`} {...rest} />
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="tm-label">{label}</label>
      {children}
    </div>
  )
}

/* ─── Section heading ─── */
export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--tm-text)' }}>{children}</h2>
      {hint && <span className="text-xs" style={{ color: 'var(--tm-text-faint)' }}>{hint}</span>}
    </div>
  )
}

/* ─── Empty state ─── */
export function EmptyState({ icon = '📭', title, hint, action }:
  { icon?: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="text-4xl mb-3 opacity-80">{icon}</div>
      <p className="text-sm font-medium" style={{ color: 'var(--tm-text)' }}>{title}</p>
      {hint && <p className="text-xs mt-1.5 max-w-xs" style={{ color: 'var(--tm-text-faint)' }}>{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ─── Skeleton loaders ─── */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`tm-skeleton ${className}`} style={style} />
}
export function SkeletonCard() {
  return (
    <div className="tm-card p-5 space-y-3">
      <Skeleton style={{ height: 14, width: '40%' }} />
      <Skeleton style={{ height: 10, width: '80%' }} />
      <Skeleton style={{ height: 10, width: '60%' }} />
    </div>
  )
}

/* ─── Stat tile (dashboard KPIs) ─── */
export function StatTile({ label, value, accent = 'indigo', sub }:
  { label: string; value: React.ReactNode; accent?: Accent; sub?: string }) {
  const c = ACCENT[accent]
  return (
    <Card hover className="p-5 relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl" style={{ background: c + '22' }} />
      <p className="text-xs relative z-10" style={{ color: 'var(--tm-text-faint)' }}>{label}</p>
      <p className="text-3xl font-bold mt-1 relative z-10" style={{ color: c }}>{value}</p>
      {sub && <p className="text-xs mt-1 relative z-10" style={{ color: 'var(--tm-text-muted)' }}>{sub}</p>}
    </Card>
  )
}
