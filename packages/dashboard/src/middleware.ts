import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

/**
 * Everything except the sign-in page is behind auth. The dashboard can stop,
 * revoke and queue work on real machines, so there is no anonymous surface.
 */
const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) await auth.protect()
})

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)).*)', '/(api|trpc)(.*)'],
}
