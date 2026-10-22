import type { Metadata } from 'next'
import { LogoMark } from '@/components/logo'
import { pathFor } from '@/i18n/config'
import { mono, sans } from '@/lib/fonts'
import { themeScript } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: '404 · circon',
  robots: { index: false, follow: true },
}

/**
 * Served as out/404.html for every unknown path (wrangler's 404-page
 * handling). A 404 cannot know which language was meant, so it speaks both.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
          <div className="bg-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <div className="flex flex-col items-center text-center">
            <LogoMark className="size-10" />
            <p className="mt-8 font-mono text-sm text-accent">404</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
            <p className="mt-1 text-lg text-muted" lang="de">Seite nicht gefunden</p>
            <div className="mt-8 flex gap-3 text-sm">
              <a href={pathFor('en')} hrefLang="en" className="rounded-lg bg-foreground px-4 py-2 font-medium text-background">
                Go home
              </a>
              <a href={pathFor('de')} hrefLang="de" lang="de" className="rounded-lg border border-border px-4 py-2 font-medium">
                Zur Startseite
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
