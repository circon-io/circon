import NextLink from 'next/link'
import { company } from '@/content/company'
import { site } from '@/content/site'
import { pathFor, type Locale } from '@/i18n/config'
import type { Dictionary } from '@/i18n/dictionaries'
import { LanguageSwitcher } from './language-switcher'
import { LogoMark } from './logo'

/** On every page, so the imprint is always one click away (§ 5 DDG). */
export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.footer
  const home = pathFor(locale)
  const columns = [
    {
      title: t.product,
      links: [
        { href: `${home}#how`, label: dict.nav.how },
        { href: `${home}#gate`, label: dict.nav.gate },
        { href: `${home}#agents`, label: dict.nav.agents },
        { href: `${home}#pricing`, label: dict.nav.pricing },
      ],
    },
    {
      title: t.resources,
      links: [
        { href: site.githubUrl, label: t.source },
        { href: `${site.githubUrl}/blob/main/SETUP.md`, label: t.docs },
        { href: site.dashboardUrl, label: dict.nav.dashboard },
        { href: `${home}#faq`, label: dict.nav.faq },
      ],
    },
    {
      title: t.legal,
      links: [
        { href: pathFor(locale, 'imprint'), label: t.imprint, internal: true },
        { href: pathFor(locale, 'privacy'), label: t.privacy, internal: true },
      ],
    },
  ]

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight">circon</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted">{t.tagline}</p>
          <div className="mt-5">
            <LanguageSwitcher current={locale} label={dict.nav.language} />
          </div>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-sm font-semibold">{column.title}</h2>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  {'internal' in link ? (
                    <NextLink href={link.href} className="text-sm text-muted transition-colors hover:text-foreground">
                      {link.label}
                    </NextLink>
                  ) : (
                    <a href={link.href} className="text-sm text-muted transition-colors hover:text-foreground">
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-separator">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {company.name}. {t.rights}
          </p>
          <p>{t.license}</p>
        </div>
      </div>
    </footer>
  )
}
