import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Env } from './env.ts'

/**
 * Two callers, two mechanisms.
 *
 * Humans arrive with a Clerk session JWT, verified against Clerk's JWKS —
 * signature checking is not something to hand-roll, so it uses `jose`.
 *
 * Runners arrive with a bearer token issued at enrollment. Only its hash is
 * stored, peppered with a server-side secret, so a database dump yields nothing
 * usable. Comparison is constant-time.
 */

export interface Principal {
  kind: 'human' | 'runner'
  id: string
  org: string
  /** Present for humans, so Stripe checkout can prefill it. */
  email?: string
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function jwkSet(env: Env) {
  if (!jwks) {
    if (!env.CLERK_JWKS_URL) throw new Error('CLERK_JWKS_URL is not set')
    jwks = createRemoteJWKSet(new URL(env.CLERK_JWKS_URL))
  }
  return jwks
}

/**
 * Why a token was rejected.
 *
 * A bare 401 makes this undebuggable: a missing CLERK_JWKS_URL, an issuer
 * mismatch and a genuinely expired token all look identical from the browser,
 * and they have completely different fixes. The reason is safe to return — it
 * describes our own configuration, never the token's contents.
 */
export type AuthFailure =
  | 'no_token'
  | 'not_configured'
  | 'issuer_mismatch'
  | 'expired'
  | 'bad_signature'
  | 'no_subject'

export interface AuthResult {
  principal: Principal | null
  failure?: AuthFailure
  detail?: string
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

/** A human, via a Clerk session token. */
export async function authenticateHumanDetailed(
  request: Request,
  env: Env,
): Promise<AuthResult> {
  const token = bearer(request)
  if (!token) return { principal: null, failure: 'no_token' }

  if (!env.CLERK_JWKS_URL) {
    return {
      principal: null,
      failure: 'not_configured',
      detail: 'CLERK_JWKS_URL is not set on the API Worker',
    }
  }

  try {
    const { payload } = await jwtVerify(token, jwkSet(env), {
      ...(env.CLERK_ISSUER ? { issuer: env.CLERK_ISSUER } : {}),
    })
    const sub = typeof payload.sub === 'string' ? payload.sub : null
    if (!sub) return { principal: null, failure: 'no_subject' }

    // Clerk puts the active organization in `org_id`; fall back to the user so
    // a personal account still has a stable tenant key.
    const org = typeof payload['org_id'] === 'string' ? payload['org_id'] : sub
    const email = typeof payload['email'] === 'string' ? payload['email'] : undefined
    return { principal: { kind: 'human', id: sub, org, ...(email ? { email } : {}) } }
  } catch (error) {
    const code = (error as { code?: string })?.code ?? ''
    const message = error instanceof Error ? error.message : String(error)

    // jose reports the mismatch but not what we expected, and the expected
    // issuer is the thing people get wrong. Say both.
    if (code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && /iss/.test(message)) {
      return {
        principal: null,
        failure: 'issuer_mismatch',
        detail: `token issuer does not match CLERK_ISSUER (${env.CLERK_ISSUER || 'unset'})`,
      }
    }
    if (code === 'ERR_JWT_EXPIRED') {
      return { principal: null, failure: 'expired', detail: 'the session token has expired' }
    }
    console.error('clerk verification failed', code, message)
    return { principal: null, failure: 'bad_signature', detail: message }
  }
}

/** Back-compat wrapper for call sites that only need the principal. */
export async function authenticateHuman(request: Request, env: Env): Promise<Principal | null> {
  return (await authenticateHumanDetailed(request, env)).principal
}

/** A runner, via its enrollment-issued bearer token. */
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

/** Turn a failure into a response that names the actual problem. */
export function authFailureResponse(result: AuthResult): Response {
  const { failure, detail } = result

  // A misconfigured Worker is our fault, not the caller's — 503 rather than 401
  // so it cannot be mistaken for "sign in again".
  if (failure === 'not_configured') {
    return Response.json(
      { ok: false, error: { code: 'not_configured', message: detail ?? 'API is misconfigured' } },
      { status: 503 },
    )
  }

  const messages: Record<string, string> = {
    no_token: 'No session token was sent. Sign in to continue.',
    expired: 'Your session expired. Reload the page.',
    issuer_mismatch: detail ?? 'Token issuer mismatch.',
    bad_signature: 'Session token could not be verified.',
    no_subject: 'Session token has no subject.',
  }

  return Response.json(
    {
      ok: false,
      error: {
        code: failure ?? 'unauthorized',
        message: messages[failure ?? ''] ?? 'Unauthorized',
        ...(detail ? { detail } : {}),
      },
    },
    { status: 401 },
  )
}

export function forbidden(message = 'Forbidden'): Response {
  return Response.json({ ok: false, error: { code: 'forbidden', message } }, { status: 403 })
}
