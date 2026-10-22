import { ImageResponse } from 'next/og'

export const dynamic = 'force-static'
const size = { width: 180, height: 180 }

/** A route handler, like og.png, so the export writes it with its extension. */
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#16151a' }}>
        <svg width="110" height="110" viewBox="0 0 24 24" fill="none" stroke="#a594ff" strokeWidth={2.4} strokeLinecap="round">
          <path d="M17 7.5A6.5 6.5 0 1 0 17 16.5" />
        </svg>
      </div>
    ),
    size,
  )
}
