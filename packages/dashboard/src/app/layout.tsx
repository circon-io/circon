import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { AuthProvider } from '@/lib/auth'
import './globals.css'

const sans = Geist({ subsets: ['latin'], variable: '--font-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: { default: 'circon', template: '%s · circon' },
  description: 'From idea to production: plans, runners and releases',
}

/**
 * Applies the saved or system color scheme before first paint, so a dark-mode
 * user never sees a white flash. Kept tiny and inline on purpose.
 */
const themeScript = `(() => {
  try {
    const saved = localStorage.getItem('circon-theme');
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch {}
})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
      </html>
    </AuthProvider>
  )
}
