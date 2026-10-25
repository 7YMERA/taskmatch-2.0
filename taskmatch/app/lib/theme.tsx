'use client'

/* Theme: dark / light. First visit follows the operating system; after that the
   choice is persisted to localStorage and applied as <html data-theme="...">
   so every CSS token flips at once. */

import { useEffect, useState } from 'react'
import { Icon } from '../components/ui'

type Theme = 'dark' | 'light'

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem('tm-theme', t) } catch { /* ignore */ }
}

export function getStoredTheme(): Theme {
  try {
    const t = localStorage.getItem('tm-theme') as Theme | null
    if (t) return t
  } catch { /* ignore */ }
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/* Runs before paint (in <head>) to avoid a flash of the wrong theme. */
export const noFlashScript =
  `(function(){try{var t=localStorage.getItem('tm-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`

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
      className={`tm-btn tm-btn-quiet tm-btn-icon ${className}`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  )
}
