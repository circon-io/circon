/**
 * The languages and the pages, declared once. Everything that links between
 * languages (the switcher, hreflang, the sitemap) reads this table, so a page
 * cannot exist in one language and be missing from the other.
 */

export const locales = ['en', 'de'] as const
export type Locale = (typeof locales)[number]

/** Where `/` goes when nothing in the request says otherwise, and hreflang's x-default. */
export const defaultLocale: Locale = 'en'

/** Set by the language switcher, read by the Worker at `/`. */
export const localeCookie = 'circon-locale'

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

/**
 * Pages below the home page, with their slug in each language. Slugs are
 * translated because "Impressum" is what a German visitor (and a German court)
 * looks for.
 */
export const pages = {
  imprint: { en: 'imprint', de: 'impressum' },
  privacy: { en: 'privacy', de: 'datenschutz' },
} as const satisfies Record<string, Record<Locale, string>>

export type PageId = keyof typeof pages

/** The path of a page in a language, always with the trailing slash. */
export function pathFor(locale: Locale, page?: PageId): string {
  return page ? `/${locale}/${pages[page][locale]}/` : `/${locale}/`
}

/** Which page a slug names in a language, or undefined. */
export function pageForSlug(locale: Locale, slug: string): PageId | undefined {
  return (Object.keys(pages) as PageId[]).find((id) => pages[id][locale] === slug)
}

/** BCP 47 tags for `<html lang>`, Open Graph and JSON-LD. */
export const localeTags: Record<Locale, { lang: string; og: string; name: string }> = {
  en: { lang: 'en', og: 'en_US', name: 'English' },
  de: { lang: 'de', og: 'de_DE', name: 'Deutsch' },
}
