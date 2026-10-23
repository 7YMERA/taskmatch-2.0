'use client'

/* Theme: dark (default) / light. Persisted to localStorage, applied as
   <html data-theme="..."> so every CSS token flips at once. */

import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem('tm-theme', t) } catch { /* ignore */ }
}

export function getStoredTheme(): Theme {
  try { return (localStorage.getItem('tm-theme') as Theme) || 'dark' } catch { return 'dark' }
}

/* Runs before paint (in <head>) to avoid a flash of the wrong theme. */
export const noFlashScript =
  `(function(){try{var t=localStorage.getItem('tm-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => { setTheme(getStoredTheme()) }, [])

  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  return (
    <button onClick={flip} aria-label="Toggle light / dark theme"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`tm-btn tm-btn-ghost ${className}`}
      style={{ padding: '8px 12px', fontSize: 16, lineHeight: 1 }}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}
