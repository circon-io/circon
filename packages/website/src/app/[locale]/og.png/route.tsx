import { ImageResponse } from 'next/og'
import { isLocale, locales } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'

export const dynamic = 'force-static'
const size = { width: 1200, height: 630 }

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

const TIERS = ['typecheck', 'unit', 'web', 'android', 'ios']

/**
 * The share card, one per language, rendered at build time. A route handler
 * rather than the opengraph-image convention, because a static export writes
 * that one without a file extension and it would be served untyped.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const dict = getDictionary(isLocale(locale) ? locale : 'en')
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'radial-gradient(circle at 15% 0%, #3b2d80 0%, #16151a 55%), #16151a',
          color: '#f4f3f8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#f4f3f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16151a" strokeWidth={2.6} strokeLinecap="round">
              <path d="M17 7.5A6.5 6.5 0 1 0 17 16.5" />
            </svg>
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>circon</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 980 }}>{dict.hero.titleLead}</div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, color: '#a594ff', maxWidth: 980 }}>{dict.hero.titleAccent}</div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          {TIERS.map((tier) => (
            <div
              key={tier}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 18px',
                borderRadius: 12,
                border: '1px solid rgba(74, 222, 128, 0.35)',
                background: 'rgba(74, 222, 128, 0.1)',
                color: '#86efac',
                fontSize: 24,
                fontFamily: 'monospace',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#86efac" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
              {tier}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
