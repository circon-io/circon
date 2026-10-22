import type { Locale } from '@/i18n/config'

export interface LegalDocument {
  title: Record<Locale, string>
  description: Record<Locale, string>
  /** ISO date of the last substantive change, shown on the page and in the sitemap. */
  updated: string
  Body: Record<Locale, () => React.ReactNode>
}
