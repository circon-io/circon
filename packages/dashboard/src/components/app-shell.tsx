'use client'

import NextLink from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/settings', label: 'Settings' },
]

/** The frame every page shares: one header, one width, one place to navigate from. */
export function AppShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center gap-4">
        <NextLink href="/" className="text-xl font-semibold">
          circon
        </NextLink>
        <nav aria-label="Main" className="flex gap-3 text-sm">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <NextLink
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={active ? 'font-medium text-foreground' : 'text-default-500 hover:text-foreground'}
              >
                {item.label}
              </NextLink>
            )
          })}
        </nav>
        {actions}
        <div className="ml-auto">
          <UserButton />
        </div>
      </header>
      {children}
    </main>
  )
}
