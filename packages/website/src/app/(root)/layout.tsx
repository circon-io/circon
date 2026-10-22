import type { Metadata } from 'next'
import { site } from '@/content/site'
import { mono, sans } from '@/lib/fonts'
import { themeScript } from '@/lib/theme'
import '../globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.name,
  // The language root is a redirect, not a page: the Worker answers it before
  // this file is ever served. This is only the fallback without the Worker.
  robots: { index: false, follow: true },
}

export default function RootRedirectLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
