import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from './env.ts'

/**
 * Two callers, two mechanisms.
 *
 * Humans arrive with a Clerk session JWT, verified against Clerk's JWKS —
 * signature checking is not something to hand-roll, so it uses `jose`.
 *
 * Runners arrive with a bearer token issued at enrolment. Only its hash is
 * stored, peppered with a server-side secret, so a database dump yields nothing
 * usable. Comparison is constant-time.
 */

export interface Principal {
  kind: 'human' | 'runner'
  id: string
  org: string
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function jwkSet(env: Env) {
  if (!jwks) {
    if (!env.CLERK_JWKS_URL) throw new Error('CLERK_JWKS_URL is not set')
    jwks = createRemoteJWKSet(new URL(env.CLERK_JWKS_URL))
  }
  return jwks
}

export async function hashToken(env: Env, raw: string): Promise<string> {
  const pepper = env.RUNNER_SECRET_PEPPER ?? ''
  const bytes = new TextEncoder().encode(`${pepper}:${raw}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Length-independent, non-short-circuiting comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

export function newToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes))
  return [...raw].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * A browser cannot set an Authorization header on a WebSocket handshake, so the
 * dashboard passes the session token as a query parameter for `/watch` only.
 * Everything else uses the header.
 */
function bearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (match?.[1]) return match[1].trim()

  if (request.headers.get('Upgrade') === 'websocket') {
    const query = new URL(request.url).searchParams.get('token')
    if (query) return query.trim()
  }
  return null
}

/** A human, via a Clerk session token. Null when absent or invalid. */
export async function authenticateHuman(request: Request, env: Env): Promise<Principal | null> {
  const token = bearer(request)
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, jwkSet(env), {
      ...(env.CLERK_ISSUER ? { issuer: env.CLERK_ISSUER } : {}),
    })
    const sub = typeof payload.sub === 'string' ? payload.sub : null
    if (!sub) return null

    // Clerk puts the active organisation in `org_id`; fall back to the user so
    // a personal account still has a stable tenant key.
    const org = typeof payload['org_id'] === 'string' ? payload['org_id'] : sub
    return { kind: 'human', id: sub, org }
  } catch {
    return null
  }
}

/** A runner, via its enrolment-issued bearer token. */
export async function authenticateRunner(request: Request, env: Env): Promise<Principal | null> {
  const token = bearer(request)
  if (!token) return null

  const hash = await hashToken(env, token)
  const row = await env.DB.prepare(
    'SELECT id, org, token_hash, revoked_at FROM runners WHERE token_hash = ?1',
  )
    .bind(hash)
    .first<{ id: string; org: string; token_hash: string; revoked_at: string | null }>()

  if (!row || row.revoked_at) return null
  if (!timingSafeEqual(row.token_hash, hash)) return null

  return { kind: 'runner', id: row.id, org: row.org }
}

export function unauthorized(message = 'Unauthorized'): Response {
  return Response.json({ ok: false, error: { code: 'unauthorized', message } }, { status: 401 })
}

export function forbidden(message = 'Forbidden'): Response {
  return Response.json({ ok: false, error: { code: 'forbidden', message } }, { status: 403 })
}
