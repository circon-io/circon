'use client'

import { useEffect, useState } from 'react'
import { buttonVariants } from '@heroui/react'
import { site } from '@/content/site'
import { pathFor, type Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries'
import { LanguageSwitcher } from './language-switcher'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { cx } from './ui/cx'
import { GitHubIcon, MenuIcon, XIcon } from './ui/icons'

/**
 * Transparent over the hero, a frosted bar once you scroll. Section links are
 * absolute (`/en/#gate`) so they also work from the legal pages.
 */
export function SiteHeader({ locale, nav }: { locale: Locale; nav: Dictionary['nav'] }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const home = pathFor(locale)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const links = [
    { href: `${home}#how`, label: nav.how },
    { href: `${home}#gate`, label: nav.gate },
    { href: `${home}#agents`, label: nav.agents },
    { href: `${home}#runner`, label: nav.runner },
    { href: `${home}#pricing`, label: nav.pricing },
    { href: `${home}#faq`, label: nav.faq },
  ]

  return (
    <header
      className={cx(
        'sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled || open ? 'border-border bg-background/80 backdrop-blur-xl' : 'border-transparent',
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-accent"
      >
        {nav.skip}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo href={home} label={nav.home} />

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <div className="hidden sm:block">
            <LanguageSwitcher current={locale} label={nav.language} />
          </div>
          <ThemeToggle toLight={nav.themeToLight} toDark={nav.themeToDark} />
          <a
            href={site.githubUrl}
            className="hidden size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-secondary hover:text-foreground sm:grid"
            aria-label={nav.github}
          >
            <GitHubIcon />
          </a>
          <a href={site.dashboardUrl} className={cx(buttonVariants({ size: 'sm', variant: 'primary' }), 'ml-1 hidden sm:inline-flex')}>
            {nav.dashboard}
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-secondary lg:hidden"
            aria-label={open ? nav.closeMenu : nav.openMenu}
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-border px-4 pb-5 pt-2 lg:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {links.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-lg px-2 py-2.5 text-[15px] text-foreground hover:bg-surface-secondary">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-separator pt-4">
            <LanguageSwitcher current={locale} label={nav.language} />
            <a href={site.dashboardUrl} className={buttonVariants({ size: 'sm', variant: 'primary' })}>
              {nav.dashboard}
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
