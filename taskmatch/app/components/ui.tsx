'use client'

/* TaskMatch design-system primitives.
   Import these instead of copy-pasting Tailwind. One definition, used everywhere. */

import React, { useEffect } from 'react'

/* ─── Outline icons (stroke-based line icons — professional, no emoji) ───
   Usage: <Icon name="bolt" />  ·  size + color inherit via currentColor. */
export type IconName =
  | 'bolt' | 'chart' | 'shield' | 'users' | 'scale' | 'lock'
  | 'sun' | 'moon' | 'arrowRight' | 'arrowDown' | 'check' | 'menu'
  | 'grid' | 'list' | 'star' | 'user' | 'pause'
  | 'plus' | 'more' | 'chevronDown' | 'trash' | 'upload' | 'arrowLeft' | 'alert' | 'clock'
  | 'search' | 'x' | 'logout' | 'mail' | 'sparkle' | 'target' | 'download' | 'history'
  | 'chevrons' | 'folder' | 'link' | 'building' | 'copy' | 'edit'
  | 'bell' | 'inbox'

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
  plus: <path d="M12 5v14M5 12h14" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  trash: <><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
  upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  arrowLeft: <path d="M20 12H4M10 6l-6 6 6 6" />,
  alert: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4h4" /><path d="M12 7.5V12l3 2" /></>,
  chevrons: <><path d="m8 9 4-4 4 4" /><path d="m8 15 4 4 4-4" /></>,
  folder: <path d="M3.5 6.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  building: <><rect x="4.5" y="3.5" width="15" height="17" rx="1.5" /><path d="M9 8h1.5M13.5 8H15M9 12h1.5M13.5 12H15M10.5 20.5v-4h3v4" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  inbox: <><path d="M3.5 13.5 6 6h12l2.5 7.5v4a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-4Z" /><path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5" /></>,
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


export type Accent = 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky'

// Accents resolve to per-theme CSS tokens, so the same accent is readable on
// the dark and the light canvas. Mix with `soft()` for tinted backgrounds.
const ACCENT: Record<Accent, string> = {
  indigo: 'var(--tm-indigo)', violet: 'var(--tm-violet)', emerald: 'var(--tm-emerald)',
  amber: 'var(--tm-amber)', rose: 'var(--tm-rose)', sky: 'var(--tm-sky)',
}
export const accentColor = (a: Accent) => ACCENT[a]
export const soft = (c: string, pct = 12) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

/* ─── Brand mark ─── one shared logo instead of four copies of the SVG.
   "Overlap": the person (indigo circle) meets the task (green tile), and the amber
   overlap is the match. Fixed colours, so it reads the same on light and dark. */
export function Logo({ size = 28, withText = true, className = '' }: { size?: number; withText?: boolean; className?: string }) {
  const uid = React.useId().replace(/:/g, '')
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="4 5.5 56 56" fill="none" role="img" aria-label="TaskMatch logo">
        <defs>
          <clipPath id={`tm-logo-clip-${uid}`}><rect x="25" y="13" width="34" height="34" rx="10" /></clipPath>
          <linearGradient id={`tm-logo-glow-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <circle cx="23" cy="36" r="18" fill="#6d6af8" />
        <rect x="25" y="13" width="34" height="34" rx="10" fill="#10b981" />
        <circle cx="23" cy="36" r="18" fill={`url(#tm-logo-glow-${uid})`} clipPath={`url(#tm-logo-clip-${uid})`} />
      </svg>
      {withText && (
        <span className="tm-wordmark" style={{ fontSize: size * 0.6 }}>
          Task<span className="tm-wordmark-accent">Match</span>
        </span>
      )}
    </span>
  )
}

/* ─── Page header ─── title, one-line description, optional actions on the right */
export function PageHeader({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div className="min-w-0">
        <h1 className="tm-page-title">{title}</h1>
        {sub && <p className="tm-page-sub">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ─── Ambient background (landing / auth screens) ───
   A faint grid fading out from the top plus one soft brand glow. Quiet on purpose. */
export function AmbientBackground({ animate = true }: { animate?: boolean }) {
  void animate
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div className="absolute inset-0 tm-grid-bg opacity-60" />
      <div className="absolute left-1/2 -translate-x-1/2 -top-40 w-[56rem] h-[28rem] rounded-full blur-3xl"
        style={{ background: 'var(--tm-primary-soft)' }} />
    </div>
  )
}

/* ─── Button ─── */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger'
}
export function Button({ variant = 'primary', className = '', ...rest }: BtnProps) {
  return <button className={`tm-btn tm-btn-${variant} ${className}`} {...rest} />
}

/* ─── Card ─── */
export function Card({ hover = false, tint, className = '', style, children }:
  { hover?: boolean; tint?: Accent; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={`tm-card ${hover ? 'tm-card-hover' : ''} ${tint ? 'tm-tint-' + tint : ''} ${className}`} style={style}>
      {children}
    </div>
  )
}

/* ─── Badge ─── */
export function Badge({ accent = 'indigo', children, className = '' }:
  { accent?: Accent; children: React.ReactNode; className?: string }) {
  const c = ACCENT[accent]
  return (
    <span className={`tm-badge ${className}`} style={{ '--tm-badge-c': c } as React.CSSProperties}>
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
      <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--tm-text)' }}>{children}</h2>
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
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
        <p className="text-[13px] font-medium text-muted">{label}</p>
      </div>
      <p className="text-3xl font-semibold tracking-tight mt-2 tabular-nums text-fg">{value}</p>
      {sub && <p className="text-xs mt-1 text-faint">{sub}</p>}
    </Card>
  )
}

/* ─── Drawer: a panel that slides in from the right, keeping the page behind it in place ─── */
export function Drawer({ open, onClose, title, sub, children, footer, width = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: React.ReactNode; sub?: React.ReactNode
  children: React.ReactNode; footer?: React.ReactNode; width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(1px)' }} />
      <aside role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className={`absolute right-0 top-0 h-full w-full ${width} flex flex-col tm-drawer`}
        style={{ background: 'var(--tm-bg-elev)', borderLeft: '1px solid var(--tm-border)', boxShadow: 'var(--tm-shadow)' }}>
        <div className="flex items-start gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--tm-border)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-fg">{title}</div>
            {sub && <div className="text-xs text-faint mt-0.5">{sub}</div>}
          </div>
          <button onClick={onClose} aria-label="Close panel" className="tm-btn tm-btn-quiet tm-btn-icon"><Icon name="x" size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--tm-border)' }}>{footer}</div>}
      </aside>
    </div>
  )
}
