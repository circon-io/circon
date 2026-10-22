import { NextResponse } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * Everything except the sign-in page is behind auth. The dashboard can stop,
 * revoke and queue work on real machines, so there is no anonymous surface.
 *
 * Preview mode (sample data, no Clerk) exists only under `next dev`; the same
 * check as lib/auth.tsx, repeated because middleware runs on its own runtime.
 */
const preview = process.env.NEXT_PUBLIC_PREVIEW === '1' && process.env.NODE_ENV === 'development'
const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default preview
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, request) => {
      if (!isPublic(request)) await auth.protect()
    })

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)).*)', '/(api|trpc)(.*)'],
}
