'use client'

import { useCallback } from 'react'
import { PREVIEW, useSessionToken } from './auth'

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
  health?: MachineHealth
}

/** The machine itself, as its daemon last measured it (every ten minutes). */
export interface MachineHealth {
  diskFreeGb: number | null
  diskTotalGb: number | null
  loadPerCore: number | null
  gpu: { name: string; utilization: number; memoryUsedMb: number; memoryTotalMb: number; temperatureC: number } | null
  ollama: boolean
  checkedAt: string
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
  /** The feedback loops this run exercised, cheapest first. */
  gate_tiers: string[]
  started_at: string
  finished_at: string | null
}

export interface Overview {
  runsLast7d: number
  running: number
  successRate7d: number | null
  spentLast24h: number
  spentLast30d: number
  pendingRequests: number
  plansAwaitingApproval: number
}

/** A credential the agent asked for mid-run. */
export interface SecretRequest {
  id: string
  name: string
  reason: string
  status: 'pending' | 'fulfilled' | 'dismissed'
  run_id: string | null
  created_at: string
  resolved_at: string | null
  project_id: string
  project_slug: string
}

export interface RunDetail extends Run {
  runner_name: string | null
  agents: Partial<Record<AgentRole, RoleSpec>> | null
  commit_subjects?: string[]
}

/** What got built across the fleet in a window: the daily report. */
export interface Digest {
  since: string
  hours: number
  projects: Array<{
    slug: string
    runs: number
    outcomes: Record<string, number>
    costUsd: number
    built: string[]
    moreBuilt: number
    pullRequests: Array<{ url: string; state: string | null }>
  }>
  totals: { runs: number; built: number; costUsd: number }
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
  const getToken = useSessionToken()

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      let res: { status: number; json: () => Promise<unknown> }
      if (PREVIEW) {
        const { previewFetch } = await import('./preview')
        const answer = await previewFetch(path, init)
        res = { status: answer.status, json: async () => answer.body }
      } else {
        const token = await getToken()
        res = await fetch(`${BASE}${path}`, {
          ...init,
          headers: {
            ...(init.headers ?? {}),
            authorization: `Bearer ${token ?? ''}`,
            ...(init.body ? { 'content-type': 'application/json' } : {}),
          },
        })
      }

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

export interface Project {
  id: string
  slug: string
  status: string
  default_branch: string
  account_login: string | null
  integration_revoked: string | null
  latest_plan: number | null
  approved_plan: number | null
}

export interface PlanSummary {
  id: string
  version: number
  status: 'draft' | 'approved' | 'superseded'
  source: 'generated' | 'refined' | 'edited'
  prompt: string | null
  model: string | null
  created_at: string
  approved_at: string | null
  commit_sha: string | null
  pr_url: string | null
}

export interface PlanCheck {
  ok: boolean
  errors: string[]
  tasks: string[]
}

/**
 * POST and read a server-sent event stream. A fetch body rather than
 * EventSource, because EventSource cannot send the Authorization header.
 */
export function useEventStream() {
  const getToken = useSessionToken()
  return useCallback(
    async (path: string, body: unknown, onEvent: (event: string, data: Record<string, unknown>) => void) => {
      if (PREVIEW) {
        const { previewStream } = await import('./preview')
        return previewStream(onEvent)
      }
      const token = await getToken()
      const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token ?? ''}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }
        throw new ApiError(err.error?.code ?? 'request_failed', err.error?.message ?? `Request failed (${res.status})`)
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        let split = buffer.indexOf('\n\n')
        while (split >= 0) {
          const block = buffer.slice(0, split)
          buffer = buffer.slice(split + 2)
          const event = /^event: (.+)$/m.exec(block)?.[1]
          const data = /^data: (.+)$/m.exec(block)?.[1]
          if (event && data) onEvent(event, JSON.parse(data) as Record<string, unknown>)
          split = buffer.indexOf('\n\n')
        }
      }
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

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`
}

/** `owner__repo` as people write it. */
export function repoName(slug: string): string {
  return slug.replace('__', '/')
}

export function duration(fromIso: string, toIso?: string | null): string {
  const secs = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso)) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
