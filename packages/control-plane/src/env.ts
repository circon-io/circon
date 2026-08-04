import type { RunnerDO } from './runner-do.ts'

export interface Env {
  DB: D1Database
  RUNNER: DurableObjectNamespace<RunnerDO>

  // vars
  /** Public by design: a well-known endpoint serving public keys. */
  CLERK_JWKS_URL?: string
  CLERK_ISSUER?: string
  ENROLL_TOKEN_TTL_MINUTES?: string
  DASHBOARD_ORIGIN?: string

  // Stripe price ids differ between test and live mode, so they are vars.
  STRIPE_PRICE_PRO?: string

  /** GitHub App: id and slug are public, the private key is not. */
  GH_APP_ID?: string
  GH_APP_SLUG?: string

  // secrets, set by the deploy workflow
  CLERK_SECRET_KEY?: string
  RUNNER_SECRET_PEPPER?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  GH_APP_PRIVATE_KEY?: string
  GH_WEBHOOK_SECRET?: string
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function ok<T>(data: T, status = 200): Response {
  return json({ ok: true, data }, status)
}

export function fail(code: string, message: string, status = 400): Response {
  return json({ ok: false, error: { code, message } }, status)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`
}
