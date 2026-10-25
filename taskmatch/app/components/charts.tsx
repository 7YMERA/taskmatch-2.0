'use client'

/* Dashboard charts — hand-rolled SVG/HTML on the tm-* tokens so they follow light and dark.
   Rules kept everywhere: thin marks, recessive axes, text in text colours (never the series
   colour), a hover tooltip on every mark, and a legend whenever there are two or more series. */

import React, { useState } from 'react'
import Link from 'next/link'
import { Card, Icon } from './ui'

/* ─── Tooltip: one floating label per chart, positioned inside a relative wrapper ─── */
type Tip = { x: number; y: number; body: React.ReactNode } | null
export function useTip() {
  const [tip, setTip] = useState<Tip>(null)
  const show = (e: React.MouseEvent | React.FocusEvent, body: React.ReactNode) => {
    const host = (e.currentTarget as HTMLElement).closest('[data-tip-host]') as HTMLElement | null
    const r = (e.currentTarget as Element).getBoundingClientRect()
    const h = host?.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2 - (h?.left || 0), y: r.top - (h?.top || 0), body })
  }
  const hide = () => setTip(null)
  const node = tip && (
    <div className="tm-tip" style={{ left: tip.x, top: tip.y }} role="status">{tip.body}</div>
  )
  return { show, hide, node }
}

/* ─── Sparkline: one quiet line, last point marked ─── */
export function Sparkline({ values, color = 'var(--tm-chart-1)', height = 28 }:
  { values: (number | null)[]; color?: string; height?: number }) {
  const pts = values.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as [number, number][]
  if (pts.length < 2) return <div style={{ height }} />
  const W = 100, max = Math.max(...pts.map(p => p[1])), min = Math.min(...pts.map(p => p[1]))
  const sx = (i: number) => (i / (values.length - 1)) * W
  const sy = (v: number) => max === min ? height / 2 : height - 3 - ((v - min) / (max - min)) * (height - 6)
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ')
  const [li, lv] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(li)} cy={sy(lv)} r="2.5" fill={color} />
    </svg>
  )
}

/* ─── Trend tile: KPI + change vs the previous period + sparkline. Clickable. ─── */
export function TrendTile({ label, value, change, goodWhen = 'up', sub, spark, href }: {
  label: string; value: React.ReactNode; change: number | null; goodWhen?: 'up' | 'down'
  sub?: string; spark?: (number | null)[]; href?: string
}) {
  const flat = change != null && Math.round(change * 100) === 0
  const good = change == null || flat ? null : (change > 0) === (goodWhen === 'up')
  const tone = good == null ? 'var(--tm-text-faint)' : good ? 'var(--tm-emerald)' : 'var(--tm-rose)'
  const body = (
    <Card className="p-5 h-full" hover={!!href}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-fg">{value}</p>
        {change != null && (
          <span className="text-xs font-medium tabular-nums inline-flex items-center gap-0.5" style={{ color: tone }}>
            {flat ? 'no change' : <>
              <Icon name="arrowDown" size={12} strokeWidth={2.2} style={{ transform: change > 0 ? 'rotate(180deg)' : undefined }} />
              {Math.abs(Math.round(change * 100))}%
            </>}
          </span>
        )}
      </div>
      {sub && <p className="text-xs mt-1 text-faint">{sub}</p>}
      {spark && <div className="mt-3"><Sparkline values={spark} /></div>}
    </Card>
  )
  return href ? <Link href={href} className="block h-full">{body}</Link> : body
}

/* ─── Status pill: state is never colour alone — icon + word ─── */
export function StatusPill({ ok, okText = 'On target', badText = 'Watch' }: { ok: boolean | null; okText?: string; badText?: string }) {
  if (ok == null) return <span className="text-xs text-faint">No data yet</span>
  const c = ok ? 'var(--tm-emerald)' : 'var(--tm-amber)'
  return (
    <span className="tm-badge" style={{ '--tm-badge-c': c } as React.CSSProperties}>
      <Icon name={ok ? 'check' : 'alert'} size={12} strokeWidth={2.2} /> {ok ? okText : badText}
    </span>
  )
}

/* ─── Legend ─── */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-xs text-muted">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  )
}

/* ─── Stacked columns (e.g. on-time vs late per week). Segments sum to the bar's total. ─── */
export function StackedColumns({ data, series, height = 180 }: {
  data: { label: string; values: number[] }[]
  series: { label: string; color: string }[]
  height?: number
}) {
  const tip = useTip()
  const max = Math.max(1, ...data.map(d => d.values.reduce((s, v) => s + v, 0)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  return (
    <div className="relative" data-tip-host onMouseLeave={tip.hide}>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-faint tabular-nums text-right w-5 shrink-0" style={{ height }}>
          {[...ticks].reverse().map(t => <span key={t} className="leading-none">{t}</span>)}
        </div>
        <div className="relative flex-1" style={{ height }}>
          {ticks.map(t => (
            <div key={t} className="absolute left-0 right-0 border-t" style={{ bottom: `${(t / top) * 100}%`, borderColor: 'var(--tm-border)', opacity: t ? 0.6 : 1 }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5">
            {data.map(d => {
              const total = d.values.reduce((s, v) => s + v, 0)
              return (
                <button key={d.label} type="button" className="flex-1 h-full flex flex-col justify-end items-stretch group outline-none"
                  aria-label={`${d.label}: ${series.map((s, i) => `${d.values[i]} ${s.label}`).join(', ')}`}
                  onMouseEnter={e => tip.show(e, <TipBody title={d.label} rows={series.map((s, i) => ({ ...s, value: d.values[i] }))} />)}
                  onFocus={e => tip.show(e, <TipBody title={d.label} rows={series.map((s, i) => ({ ...s, value: d.values[i] }))} />)}
                  onBlur={tip.hide}>
                  <div className="flex flex-col-reverse gap-[2px] mx-auto w-full max-w-[28px] group-hover:opacity-80 group-focus-visible:opacity-80 transition-opacity"
                    style={{ height: `${(total / top) * 100}%` }}>
                    {d.values.map((v, i) => v > 0 && (
                      <div key={i} style={{ flexGrow: v, background: series[i].color, borderRadius: i === d.values.length - 1 || d.values.slice(i + 1).every(x => !x) ? '4px 4px 0 0' : 0 }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-[3px] sm:gap-1.5 pl-7 mt-1.5">
        {data.map((d, i) => (
          <span key={d.label} className="flex-1 text-center text-[10px] text-faint truncate">
            {i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
      {tip.node}
    </div>
  )
}

export function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5
  const out = []
  for (let t = 0; t <= max + step - 1 && out.length < 7; t += step) out.push(t)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}

function TipBody({ title, rows }: { title: string; rows: { label: string; color: string; value: React.ReactNode }[] }) {
  return (
    <>
      <p className="font-medium text-fg mb-1">{title}</p>
      {rows.map(r => (
        <p key={r.label} className="flex items-center gap-1.5 text-muted">
          <span className="w-2 h-2 rounded-sm" style={{ background: r.color }} />{r.label}
          <span className="ml-auto pl-3 tabular-nums text-fg">{r.value}</span>
        </p>
      ))}
    </>
  )
}

/* ─── Heatmap: rows × columns, one hue light→dark by value. ─── */
export function Heatmap({ rows, cols, max, limit, rowHref }: {
  rows: { id: string; label: string; cells: number[] }[]
  cols: string[]
  max: number
  limit: number
  rowHref?: (id: string) => string
}) {
  const tip = useTip()
  const fill = (v: number) => v === 0 ? 'var(--tm-track)' : `color-mix(in srgb, var(--tm-chart-1) ${Math.round(25 + 75 * Math.min(1, v / Math.max(1, max)))}%, var(--tm-surface-1))`
  return (
    <div className="relative" data-tip-host onMouseLeave={tip.hide}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th />
              {cols.map((c, i) => <th key={c} className="text-[10px] font-normal text-faint text-center">{i === cols.length - 1 ? 'This wk' : c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="pr-2 text-xs text-muted whitespace-nowrap max-w-[9rem] truncate">
                  {rowHref ? <Link href={rowHref(r.id)} className="hover:text-fg">{r.label}</Link> : r.label}
                </td>
                {r.cells.map((v, i) => (
                  <td key={i} tabIndex={0} className="h-7 min-w-7 rounded-[4px] text-center text-[10px] tabular-nums outline-none focus-visible:ring-2"
                    style={{ background: fill(v), color: v / Math.max(1, max) > 0.55 ? '#fff' : 'var(--tm-text-muted)', boxShadow: v >= limit ? 'inset 0 0 0 2px var(--tm-rose)' : undefined }}
                    aria-label={`${r.label}, ${i === cols.length - 1 ? 'this week' : 'week of ' + cols[i]}: ${v} active tasks`}
                    onMouseEnter={e => tip.show(e, <><p className="font-medium text-fg">{r.label}</p><p className="text-muted">{i === cols.length - 1 ? 'This week' : `Week of ${cols[i]}`}: <span className="text-fg tabular-nums">{v}</span> active task{v === 1 ? '' : 's'}{v >= limit ? ' · at limit' : ''}</p></>)}
                    onFocus={e => tip.show(e, <><p className="font-medium text-fg">{r.label}</p><p className="text-muted">{v} active</p></>)}
                    onBlur={tip.hide}>
                    {v || ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-faint">
        <span>Fewer</span>
        {[0, 1, 2, 3].map(v => <span key={v} className="w-4 h-3 rounded-sm" style={{ background: fill(Math.round((v / 3) * max)) }} />)}
        <span>More</span>
        <span className="ml-3 inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-sm" style={{ boxShadow: 'inset 0 0 0 2px var(--tm-rose)' }} />At the {limit}-task limit</span>
      </div>
      {tip.node}
    </div>
  )
}
