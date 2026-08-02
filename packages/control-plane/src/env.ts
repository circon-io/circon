import type { RunnerDO } from './runner-do.ts'

export interface Env {
  DB: D1Database
  RUNNER: DurableObjectNamespace<RunnerDO>

  // vars
  CLERK_ISSUER?: string
  ENROLL_TOKEN_TTL_MINUTES?: string
  DASHBOARD_ORIGIN?: string

  // secrets, set by the deploy workflow
  CLERK_JWKS_URL?: string
  RUNNER_SECRET_PEPPER?: string
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
