'use client'

/* TaskMatch design-system primitives.
   Import these instead of copy-pasting Tailwind. One definition, used everywhere. */

import React from 'react'

/* ─── Outline icons (stroke-based line icons — professional, no emoji) ───
   Usage: <Icon name="bolt" />  ·  size + color inherit via currentColor. */
type IconName =
  | 'bolt' | 'chart' | 'shield' | 'users' | 'scale' | 'lock'
  | 'sun' | 'moon' | 'arrowRight' | 'arrowDown' | 'check' | 'menu'
  | 'grid' | 'list' | 'star' | 'user' | 'pause'

const PATHS: Record<IconName, React.ReactNode> = {
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  chart: <><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="5" width="3" height="12" /></>,
  shield: <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.8" /><path d="M17 20a5 5 0 0 0-3-4.6" /></>,
  scale: <><path d="M12 3v18" /><path d="M7 7h10" /><path d="M5 7 3 13h4L5 7Z" /><path d="M19 7l-2 6h4l-2-6Z" /><path d="M8 21h8" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  arrowRight: <path d="M4 12h16M14 6l6 6-6 6" />,
  arrowDown: <path d="M12 4v16M6 14l6 6 6-6" />,
  check: <path d="M4 12l5 5L20 6" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  star: <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.1l1-5.8L3.5 9.2l5.9-.9L12 3Z" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  pause: <><rect x="7" y="5" width="3.5" height="14" rx="1" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" /></>,
}

export function Icon({ name, size = 20, strokeWidth = 1.8, className = '', style }:
  { name: IconName; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden>
      {PATHS[name]}
    </svg>
  )
}


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
      <div className="absolute top-1/4 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl"
        style={{ background: 'rgba(56,189,248,0.18)', animation: animate ? 'tm-drift 18s ease-in-out infinite reverse' : undefined }} />
      <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full blur-3xl"
        style={{ background: 'rgba(52,211,153,0.16)', animation: animate ? 'tm-float 10s ease-in-out infinite' : undefined }} />
      <div className="absolute top-1/2 left-1/2 w-72 h-72 rounded-full blur-3xl"
        style={{ background: 'rgba(251,191,36,0.10)', animation: animate ? 'tm-drift 22s ease-in-out infinite' : undefined }} />
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
export function EmptyState({ icon, title, hint, action }:
  { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="mb-3 opacity-60" style={{ color: 'var(--tm-text-faint)' }}>{icon}</div>}
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
