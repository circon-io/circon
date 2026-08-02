import { en } from './locales/en.ts'
import { de } from './locales/de.ts'

/**
 * English and German are both first-class: a feature with only one is not done.
 *
 * `de` is typed as Record<keyof typeof en, string>, so adding an English key
 * without a German one fails the build rather than silently shipping English
 * to German users.
 */

export type Locale = 'en' | 'de'
export type TranslationKey = keyof typeof en

const catalogs: Record<Locale, Record<TranslationKey, string>> = { en, de }

export const locales: Locale[] = ['en', 'de']
export const defaultLocale: Locale = 'en'

export function isLocale(value: string): value is Locale {
  return (locales as string[]).includes(value)
}

/** Best match from an Accept-Language header or device setting. */
export function negotiate(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.split('-')[0]?.toLowerCase() ?? ''
    if (isLocale(base)) return base
  }
  return defaultLocale
}

/**
 * Missing keys fall back to English rather than rendering the raw key, because
 * an untranslated string is a worse bug when it reaches a user as
 * `auth.signIn.submit`.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const template = catalogs[locale][key] ?? catalogs[defaultLocale][key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

export function translator(locale: Locale) {
  return (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars)
}
