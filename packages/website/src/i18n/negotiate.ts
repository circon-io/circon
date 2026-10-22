import { defaultLocale, isLocale, localeCookie, locales, type Locale } from './config.ts'

/**
 * The language for a visitor arriving at `/`: an explicit choice made with the
 * switcher wins, then the browser's Accept-Language in quality order, then the
 * default. Pure, so the Worker and the tests share it.
 */
export function negotiateLocale(acceptLanguage: string | null, cookieHeader: string | null): Locale {
  const chosen = readCookie(cookieHeader, localeCookie)
  if (chosen && isLocale(chosen)) return chosen

  const ranked = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.slice(2)) : 1, index }
    })
    .filter((entry) => entry.tag && Number.isFinite(entry.q) && entry.q > 0)
    // Stable on ties: the browser's own order breaks them.
    .sort((a, b) => b.q - a.q || a.index - b.index)

  for (const { tag } of ranked) {
    const primary = tag.split('-')[0]
    const match = locales.find((locale) => locale === primary)
    if (match) return match
  }
  return defaultLocale
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const pair of (header ?? '').split(';')) {
    const [key, ...rest] = pair.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}
