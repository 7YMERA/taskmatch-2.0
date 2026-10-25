'use client'

// Lightweight app-wide toast + confirm system built on the tm-* theme tokens (dark + light).
// Imperative API (toast/confirmDialog) so it works from any event handler, not just render.
// Mount <UiHost /> once in the root layout.

import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: number; message: string; type: ToastType }

let toasts: Toast[] = []
const toastListeners = new Set<() => void>()
let nextId = 1
const emitToasts = () => toastListeners.forEach(l => l())

export function toast(message: string, type: ToastType = 'info') {
  const id = nextId++
  toasts = [...toasts, { id, message, type }]
  emitToasts()
  setTimeout(() => { toasts = toasts.filter(t => t.id !== id); emitToasts() }, type === 'error' ? 5000 : 3200)
}
export const toastSuccess = (m: string) => toast(m, 'success')
export const toastError = (m: string) => toast(m, 'error')

type ConfirmOpts = { message: string; title?: string; confirmLabel?: string; danger?: boolean }
type PromptOpts = { label?: string; placeholder?: string; inputMode?: 'text' | 'decimal' }
type ConfirmState = (ConfirmOpts & { prompt?: PromptOpts; value?: string; resolve: (v: boolean) => void }) | null
let confirmState: ConfirmState = null
const confirmListeners = new Set<() => void>()
const emitConfirm = () => confirmListeners.forEach(l => l())

// Themed replacement for window.confirm — returns a Promise<boolean>.
export function confirmDialog(opts: ConfirmOpts | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts
  return new Promise(resolve => { confirmState = { ...o, resolve }; emitConfirm() })
}

// Themed replacement for window.prompt — resolves to the typed text, or null if cancelled.
export function promptDialog(opts: ConfirmOpts & PromptOpts): Promise<string | null> {
  const { label, placeholder, inputMode, ...rest } = opts
  return new Promise(resolve => {
    const state: NonNullable<ConfirmState> = {
      ...rest, prompt: { label, placeholder, inputMode }, value: '',
      resolve: ok => resolve(ok ? (state.value ?? '') : null),
    }
    confirmState = state
    emitConfirm()
  })
}

// Neutral card with a coloured status dot: reads cleanly in either theme.
const TOAST_STYLE: Record<ToastType, { icon: string; iconColor: string }> = {
  success: { icon: '✓', iconColor: 'var(--tm-chart-2)' },
  error: { icon: '!', iconColor: 'var(--tm-danger)' },
  info: { icon: 'i', iconColor: 'var(--tm-primary)' },
}

export function UiHost() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force(x => x + 1)
    toastListeners.add(l); confirmListeners.add(l)
    return () => { toastListeners.delete(l); confirmListeners.delete(l) }
  }, [])

  const close = (v: boolean) => { const s = confirmState; confirmState = null; emitConfirm(); s?.resolve(v) }

  return (
    <>
      <style>{`@keyframes tm-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
@keyframes tm-modal-in{from{opacity:0;transform:scale(0.97)}to{opacity:1;transform:scale(1)}}`}</style>

      <div style={{ position: 'fixed', top: 16, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 9999, pointerEvents: 'none' }}>
        {toasts.map(t => {
          const st = TOAST_STYLE[t.type]
          return (
            <div key={t.id} style={{ pointerEvents: 'auto', maxWidth: 460, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--tm-bg-elev)', borderRadius: 10, padding: '10px 14px', boxShadow: 'var(--tm-shadow)', animation: 'tm-toast-in 0.18s ease-out' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: st.iconColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{st.icon}</span>
              <span style={{ fontSize: 14, color: 'var(--tm-text)', lineHeight: 1.4 }}>{t.message}</span>
            </div>
          )
        })}
      </div>

      {confirmState && (
        <div onClick={() => close(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, background: 'var(--tm-bg-elev)', borderRadius: 14, padding: 24, boxShadow: 'var(--tm-shadow)', animation: 'tm-modal-in 0.16s ease-out' }}>
            {confirmState.title && <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--tm-text)', margin: '0 0 8px' }}>{confirmState.title}</p>}
            <p style={{ fontSize: 14, color: 'var(--tm-text-muted)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-line' }}>{confirmState.message}</p>
            {confirmState.prompt && (
              <form onSubmit={e => { e.preventDefault(); close(true) }} style={{ marginTop: 16 }}>
                {confirmState.prompt.label && <label className="tm-label" htmlFor="tm-prompt">{confirmState.prompt.label}</label>}
                <input id="tm-prompt" className="tm-input" autoFocus inputMode={confirmState.prompt.inputMode}
                  placeholder={confirmState.prompt.placeholder} defaultValue=""
                  onChange={e => { if (confirmState) confirmState.value = e.target.value }} />
              </form>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => close(false)} className="tm-btn tm-btn-ghost tm-btn-sm">Cancel</button>
              <button onClick={() => close(true)} autoFocus={!confirmState.prompt} className={`tm-btn tm-btn-sm ${confirmState.danger ? 'tm-btn-danger' : 'tm-btn-primary'}`}>{confirmState.confirmLabel || 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
