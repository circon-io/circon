import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import type { MiddlewareHandler } from 'hono'
import { err } from '@app/shared'

/**
 * Who is calling, verified on the server for every request.
 *
 * The apps sign in with Clerk and send the session token; this checks its
 * signature against Clerk's published keys. A hidden button in the app is not
 * access control — the role checks here are.
 */

export interface Principal {
  userId: string
  email: string | null
  orgId: string | null
  /** `admin` or `member`, normalized from either Clerk session token version. */
  role: 'admin' | 'member' | null
}

export type VerifyToken = (token: string) => Promise<Principal | null>

/**
 * Clerk's session token carries the organization in two shapes: v1 has
 * `org_id`/`org_role` ("org:admin"), v2 has `o: { id, rol }` ("admin").
 */
export function principalFrom(payload: JWTPayload): Principal | null {
  if (typeof payload.sub !== 'string') return null
  const o = (payload['o'] ?? {}) as { id?: unknown; rol?: unknown }
  const orgId = typeof o.id === 'string' ? o.id : typeof payload['org_id'] === 'string' ? payload['org_id'] : null
  const rawRole = typeof o.rol === 'string' ? o.rol : typeof payload['org_role'] === 'string' ? payload['org_role'] : null
  const role = rawRole ? (rawRole.replace(/^org:/, '') === 'admin' ? 'admin' : 'member') : null
  const email = typeof payload['email'] === 'string' ? payload['email'] : null
  return { userId: payload.sub, email, orgId, role }
}

export function clerkVerifier(jwksUrl: string, issuer?: string): VerifyToken {
  // Unconfigured means nobody can sign in, not that the API is down: /health
  // and the webhook must keep answering while CLERK_JWKS_URL is still empty.
  if (!jwksUrl) return async () => null
  const keys = createRemoteJWKSet(new URL(jwksUrl))
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, issuer ? { issuer } : {})
      return principalFrom(payload)
    } catch {
      return null
    }
  }
}

export type AuthEnv = { Variables: { principal: Principal } }

export function requireAuth(verify: VerifyToken): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const token = header.match(/^Bearer\s+(.+)$/i)?.[1]
    const principal = token ? await verify(token) : null
    if (!principal) return c.json(err('unauthenticated', 'Sign in to continue.'), 401)
    c.set('principal', principal)
    await next()
  }
}

export function requireRole(role: 'admin'): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    if (c.get('principal').role !== role) {
      return c.json(err('forbidden', 'This needs an organization admin.'), 403)
    }
    await next()
  }
}
