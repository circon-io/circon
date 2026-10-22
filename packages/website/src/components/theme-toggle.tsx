'use client'

import { useEffect, useState } from 'react'
import { themeKey } from '@/lib/theme'
import { MoonIcon, SunIcon } from './ui/icons'

/** Light or dark, remembered per browser; the system preference until chosen. */
export function ThemeToggle({ toLight, toDark }: { toLight: string; toDark: string }) {
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
      localStorage.setItem(themeKey, next ? 'dark' : 'light')
    } catch {
      /* private mode: the choice lasts for this page only */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
      aria-label={dark ? toLight : toDark}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
