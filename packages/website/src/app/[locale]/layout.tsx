import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { RevealObserver } from '@/components/reveal-observer'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { site } from '@/content/site'
import { isLocale, localeTags, locales } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'
import { mono, sans } from '@/lib/fonts'
import { graph, organizationLd, websiteLd } from '@/lib/seo'
import { themeScript } from '@/lib/theme'
import '../globals.css'

export const dynamicParams = false

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafb' },
    { media: '(prefers-color-scheme: dark)', color: '#16151a' },
  ],
  colorScheme: 'light dark',
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const dict = getDictionary(locale)
  return {
    metadataBase: new URL(site.url),
    applicationName: site.name,
    title: { default: dict.meta.title, template: `%s · ${site.name}` },
    description: dict.meta.description,
    creator: site.name,
    publisher: site.name,
    icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
    formatDetection: { telephone: false, email: false, address: false },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    },
  }
}

/**
 * The root layout, one per language: `<html lang>` must be right in the
 * static HTML, which is why the language is the top segment rather than
 * something read on the client.
 */
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  const dict = getDictionary(locale)

  return (
    <html lang={localeTags[locale].lang} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <JsonLd data={graph(organizationLd(locale), websiteLd(locale, dict))} />
        <RevealObserver>
          <SiteHeader locale={locale} nav={dict.nav} />
          <main id="main">{children}</main>
          <SiteFooter locale={locale} dict={dict} />
        </RevealObserver>
      </body>
    </html>
  )
}
