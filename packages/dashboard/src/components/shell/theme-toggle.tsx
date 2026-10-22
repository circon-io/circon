'use client'

import { useEffect, useState } from 'react'
import { MoonIcon, SunIcon } from '../ui/icons'

/** Light or dark, remembered per browser; the system preference until chosen. */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    queueMicrotask(() => setDark(document.documentElement.classList.contains('dark')))
    return () => observer.disconnect()
  }, [])

  const toggle = () => {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('circon-theme', next ? 'dark' : 'light')
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
