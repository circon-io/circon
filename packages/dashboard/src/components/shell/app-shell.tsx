'use client'

import { useCallback, useState } from 'react'
import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { OrgSwitcher, UserMenu } from '@/lib/auth'
import { useApi, type Overview } from '@/lib/api'
import { useData } from '@/lib/use-data'
import { cx } from '../ui/primitives'
import {
  FolderIcon, HomeIcon, InboxIcon, MenuIcon, PlayIcon, ServerIcon, SettingsIcon, XIcon,
} from '../ui/icons'
import { ThemeToggle } from './theme-toggle'

const NAV = [
  { href: '/', label: 'Overview', icon: HomeIcon, exact: true },
  { href: '/projects', label: 'Projects', icon: FolderIcon },
  { href: '/runs', label: 'Runs', icon: PlayIcon },
  { href: '/runners', label: 'Runners', icon: ServerIcon },
  { href: '/requests', label: 'Requests', icon: InboxIcon, badge: 'requests' as const },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
]

function Logo() {
  return (
    <NextLink href="/" className="flex items-center gap-2.5 px-2" aria-label="circon home">
      <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
          <path d="M17 7.5A6.5 6.5 0 1 0 17 16.5" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">circon</span>
    </NextLink>
  )
}

function Nav({ pendingRequests, onNavigate }: { pendingRequests: number; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <NextLink
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
              active ? 'bg-surface font-medium text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05)] ring-1 ring-border' : 'text-muted hover:bg-surface-secondary hover:text-foreground',
            )}
          >
            <Icon className={cx('size-4', active ? 'text-foreground' : 'text-muted group-hover:text-foreground')} />
            <span className="flex-1">{item.label}</span>
            {item.badge === 'requests' && pendingRequests > 0 && (
              <span className="rounded-full bg-warning px-1.5 text-[11px] font-semibold text-warning-foreground tabular-nums">
                {pendingRequests}
              </span>
            )}
          </NextLink>
        )
      })}
    </nav>
  )
}

/**
 * The frame every page shares: navigation on the left, the page on a calm
 * background, counts that need attention right in the nav.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const api = useApi()
  const load = useCallback(() => api<Overview>('/api/overview'), [api])
  const { data } = useData(load, { intervalMs: 15_000 })
  const [open, setOpen] = useState(false)
  const pending = data?.pendingRequests ?? 0

  const sidebar = (
    <div className="flex h-full flex-col gap-6 px-3 py-4">
      <div className="flex items-center justify-between">
        <Logo />
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-secondary lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <XIcon />
        </button>
      </div>
      <OrgSwitcher />
      <Nav pendingRequests={pending} onNavigate={() => setOpen(false)} />
      <div className="mt-auto flex items-center justify-between border-t border-separator px-1 pt-4">
        <UserMenu />
        <ThemeToggle />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-border bg-background-secondary lg:block">{sidebar}</aside>

      {/* Small screens: a top bar and a slide-over navigation. */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-secondary"
          aria-label="Open navigation"
        >
          <MenuIcon className="size-5" />
          {pending > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-warning" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-background-secondary">{sidebar}</aside>
        </div>
      )}

      <main className="min-w-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-10">{children}</div>
      </main>
    </div>
  )
}
