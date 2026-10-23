'use client'

import { usePathname } from 'next/navigation'
import { isLocale, localeCookie, localeTags, locales, pageForSlug, pathFor, type Locale } from '@/i18n/config'
import { cx } from './ui/cx'

/** The same page in another language: `/de/impressum/` ⇄ `/en/imprint/`. */
function counterpart(pathname: string, target: Locale): string {
  const [first, slug] = pathname.split('/').filter(Boolean)
  if (!first || !isLocale(first)) return pathFor(target)
  const page = slug ? pageForSlug(first, slug) : undefined
  return pathFor(target, page)
}

/** Read by the Worker the next time `/` is opened. */
function rememberLocale(locale: Locale) {
  document.cookie = `${localeCookie}=${locale}; path=/; max-age=31536000; samesite=lax`
}

/**
 * Plain links, not a menu: crawlers follow them and they carry hreflang. The
 * section you were reading (the #hash) comes along, and the choice is stored
 * in a cookie the Worker reads the next time you open `/`.
 */
export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname() ?? `/${current}/`

  const remember = (locale: Locale, event: React.MouseEvent<HTMLAnchorElement>) => {
    rememberLocale(locale)
    if (window.location.hash) {
      event.preventDefault()
      window.location.assign(event.currentTarget.pathname + window.location.hash)
    }
  }

  return (
    <nav aria-label={label} className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5 text-xs font-medium">
      {locales.map((locale) => {
        const active = locale === current
        return (
          <a
            key={locale}
            href={counterpart(pathname, locale)}
            hrefLang={localeTags[locale].lang}
            lang={localeTags[locale].lang}
            aria-current={active ? 'true' : undefined}
            title={localeTags[locale].name}
            onClick={(event) => remember(locale, event)}
            className={cx(
              'rounded-md px-2 py-1 uppercase tracking-wide transition-colors',
              active ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
            )}
          >
            {locale}
          </a>
        )
      })}
    </nav>
  )
}
