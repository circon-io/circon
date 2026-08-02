import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from '../core/paths.ts'

/**
 * The runner's half of the control plane.
 *
 * Everything here fails soft. A runner works standalone today, and centralising
 * configuration must not turn a working machine into one that depends on a
 * service being reachable — so an unreachable control plane always falls back
 * to the cached copy rather than refusing to run.
 */

export interface Enrolment {
  url: string
  runnerId: string
  token: string
  org: string
  name: string
  enrolledAt: string
}

export interface RemoteConfig {
  budgetPerRunUsd?: number
  budgetPerDayUsd?: number
  verifyEvery?: number
  verifyModel?: string
  gateTiers?: string[]
  iosRunnerMode?: 'none' | 'mac' | 'device' | 'vm'
}

const ENROLMENT = () => join(paths.config, 'enrolment.json')
const CONFIG_CACHE = () => join(paths.state, 'remote-config.json')

export function readEnrolment(): Enrolment | null {
  if (!existsSync(ENROLMENT())) return null
  try {
    return JSON.parse(readFileSync(ENROLMENT(), 'utf8')) as Enrolment
  } catch {
    return null
  }
}

export function writeEnrolment(enrolment: Enrolment): void {
  mkdirSync(paths.config, { recursive: true })
  // The runner credential is a long-lived secret.
  writeFileSync(ENROLMENT(), `${JSON.stringify(enrolment, null, 2)}\n`, { mode: 0o600 })
  chmodSync(ENROLMENT(), 0o600)
}

export function isEnrolled(): boolean {
  return readEnrolment() !== null
}

async function request(
  enrolment: Enrolment,
  path: string,
  init: RequestInit = {},
): Promise<unknown | null> {
  try {
    const res = await fetch(new URL(path, enrolment.url), {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${enrolment.token}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { ok?: boolean; data?: unknown }
    return body.ok ? (body.data ?? null) : null
  } catch {
    // Offline, DNS failure, control plane down — all the same to the caller.
    return null
  }
}

/** Exchange a one-time enrolment token for a runner credential. */
export async function enroll(
  url: string,
  token: string,
  name: string,
  cliVersion: string,
): Promise<Enrolment | { error: string }> {
  try {
    const res = await fetch(new URL('/api/enroll', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name, platform: process.platform, cliVersion }),
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json()) as {
      ok?: boolean
      data?: { runnerId: string; token: string; org: string; name: string }
      error?: { message?: string }
    }
    if (!res.ok || !body.ok || !body.data) {
      return { error: body.error?.message ?? `enrolment refused (HTTP ${res.status})` }
    }
    return {
      url,
      runnerId: body.data.runnerId,
      token: body.data.token,
      org: body.data.org,
      name: body.data.name,
      enrolledAt: new Date().toISOString(),
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Per-runner config, with the last good copy as a fallback.
 *
 * Precedence is dashboard-first so "why is this runner behaving differently"
 * stays answerable, but the cache means a control-plane outage degrades to the
 * previous settings rather than to nothing.
 */
export async function fetchConfig(): Promise<{ config: RemoteConfig; stale: boolean }> {
  const enrolment = readEnrolment()
  if (!enrolment) return { config: {}, stale: false }

  const fresh = (await request(enrolment, '/api/runner/config')) as
    | { config?: RemoteConfig }
    | null

  if (fresh?.config) {
    mkdirSync(paths.state, { recursive: true })
    writeFileSync(CONFIG_CACHE(), `${JSON.stringify(fresh.config, null, 2)}\n`)
    return { config: fresh.config, stale: false }
  }

  if (existsSync(CONFIG_CACHE())) {
    try {
      return { config: JSON.parse(readFileSync(CONFIG_CACHE(), 'utf8')) as RemoteConfig, stale: true }
    } catch {
      /* fall through */
    }
  }
  return { config: {}, stale: true }
}

export interface QueuedJob {
  id: string
  projectSlug: string
  maxLoops: number
}

export async function claimJob(): Promise<QueuedJob | null> {
  const enrolment = readEnrolment()
  if (!enrolment) return null
  const data = (await request(enrolment, '/api/runner/claim', { method: 'POST' })) as
    | { job?: QueuedJob | null }
    | null
  return data?.job ?? null
}

export interface RunRecord {
  runId: string
  projectSlug: string
  branch?: string
  outcome?: string
  iterations?: number
  commits?: number
  costUsd?: number
  prUrl?: string
  failedTier?: string
  jobId?: string
}

export async function reportRun(record: RunRecord): Promise<boolean> {
  const enrolment = readEnrolment()
  if (!enrolment) return false
  const data = await request(enrolment, '/api/runner/run', {
    method: 'POST',
    body: JSON.stringify(record),
  })
  return data !== null
}

export function socketUrl(enrolment: Enrolment): string {
  const url = new URL('/api/runner/socket', enrolment.url)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
