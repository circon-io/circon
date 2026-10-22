'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'

/**
 * Typed client for the control-plane Worker.
 *
 * The Clerk session token is attached per request rather than stored, so a
 * signed-out tab cannot keep acting. The control plane verifies it against
 * Clerk's JWKS — this side never trusts its own claims.
 */

const BASE = process.env['NEXT_PUBLIC_CONTROL_PLANE_URL'] ?? ''

export interface RunnerState {
  status: 'idle' | 'running' | 'offline'
  project?: string
  branch?: string
  runId?: string
  iteration?: number
  costUsd?: number
  lastSeenAt?: string
}

export type AgentBackend = 'aider' | 'claude-code' | 'codex'
export type AgentRole = 'plan' | 'build' | 'review'

export interface RoleSpec {
  backend: AgentBackend
  model?: string
  editorModel?: string
}

/** Mirrors the control plane's RunConfig; every key optional so layers can inherit. */
export interface RunConfig {
  budgetPerRunUsd?: number
  budgetPerDayUsd?: number
  verifyEvery?: number
  verifyBudgetUsd?: number
  iosRunnerMode?: 'none' | 'simulator' | 'device'
  skipTiers?: string[]
  agents?: Partial<Record<AgentRole, RoleSpec | null>>
}

export interface Runner {
  id: string
  name: string
  platform: string | null
  cli_version: string | null
  conventions_ref: string | null
  config: RunConfig
  created_at: string
  last_seen_at: string | null
  state: RunnerState
}

export interface Run {
  id: string
  runner_id: string
  job_id: string | null
  project_slug: string
  branch: string | null
  outcome: string | null
  iterations: number
  commits: number
  cost_usd: number
  pr_url: string | null
  pr_state: string | null
  failed_tier: string | null
  started_at: string
  finished_at: string | null
}

export interface RunDetail extends Run {
  runner_name: string | null
  agents: Partial<Record<AgentRole, RoleSpec>> | null
}

export class ApiError extends Error {
  readonly code: string
  /** Per-field reasons, when the control plane rejected a config. */
  readonly fields: string[]
  constructor(code: string, message: string, fields: string[] = []) {
    super(message)
    this.code = code
    this.fields = fields
    this.name = 'ApiError'
  }
}

export function useApi() {
  const { getToken } = useAuth()

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken()
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${token ?? ''}`,
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
      })

      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        data?: T
        error?: { code?: string; message?: string; fields?: string[] }
      }

      if (!body.ok) {
        throw new ApiError(
          body.error?.code ?? 'request_failed',
          body.error?.message ?? `Request failed (${res.status})`,
          body.error?.fields ?? [],
        )
      }
      return body.data as T
    },
    [getToken],
  )
}

export function controlPlaneUrl(): string {
  return BASE
}

export function money(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const secs = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86_400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86_400)}d ago`
}
