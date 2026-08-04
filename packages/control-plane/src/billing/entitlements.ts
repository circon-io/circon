import type { Env } from '../env.ts'
import { readBillingTag, type BillingTag } from './clerk.ts'
import { planFor, type FeatureId, type Plan, type PlanLimits } from './plans.ts'

/**
 * The one place that answers "is this org allowed to do this?".
 *
 * Enforcement lives here, on the server, and never in the CLI. A limit shipped
 * to someone's machine in open-source TypeScript is bypassed in a minute; a
 * limit checked at enrollment is not.
 */

export interface Entitlement {
  plan: Plan
  tag: BillingTag
  limits: PlanLimits
}

export interface Decision {
  allowed: boolean
  reason?: string
  /** Current usage and the ceiling, so the UI can say 1 of 1 rather than "no". */
  used?: number
  limit?: number
  upgradeTo?: 'pro'
}

/**
 * A subscription that has lapsed drops to the free plan rather than to nothing.
 *
 * `past_due` deliberately keeps full access: cards fail for boring reasons, and
 * cutting a customer off mid-run over a billing retry would destroy more trust
 * than the few days of service costs.
 */
const DEGRADED_STATUSES = new Set(['canceled', 'incomplete_expired', 'unpaid'])

export async function entitlementFor(env: Env, orgId: string): Promise<Entitlement> {
  const tag = await readBillingTag(env, orgId)
  const effective = tag.status && DEGRADED_STATUSES.has(tag.status) ? 'basic' : tag.plan
  const plan = planFor(effective)
  return { plan, tag, limits: plan.limits }
}

export async function countRunners(env: Env, orgId: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM runners WHERE org = ?1 AND revoked_at IS NULL',
  )
    .bind(orgId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/**
 * The headline check, run at enrollment.
 *
 * Only *new* runners are blocked. An org that downgrades keeps the runners it
 * already has working — silently killing machines someone depends on is a
 * worse outcome than briefly exceeding a limit, and they cannot add more.
 */
export async function canEnrollRunner(env: Env, orgId: string): Promise<Decision> {
  const { plan, limits } = await entitlementFor(env, orgId)
  const used = await countRunners(env, orgId)

  if (used < limits.runners) {
    return { allowed: true, used, limit: limits.runners }
  }

  return {
    allowed: false,
    used,
    limit: limits.runners,
    reason:
      `The ${plan.name} plan allows ${limits.runners} ` +
      `runner${limits.runners === 1 ? '' : 's'}, and ${used} ${used === 1 ? 'is' : 'are'} enrolled.`,
    ...(plan.id === 'basic' ? { upgradeTo: 'pro' as const } : {}),
  }
}

/**
 * A project is a repository connected through an integration, so both are capped.
 *
 * Counted against *active* projects only: a project whose integration was
 * uninstalled is inactive and should not consume the allowance, or uninstalling
 * an App would silently lock someone out of connecting a replacement.
 */
export async function canAddProject(env: Env, orgId: string): Promise<Decision> {
  const { plan, limits } = await entitlementFor(env, orgId)
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM projects WHERE org = ?1 AND status = 'active'`,
  )
    .bind(orgId)
    .first<{ n: number }>()
  const used = row?.n ?? 0

  if (used < limits.projects) return { allowed: true, used, limit: limits.projects }

  return {
    allowed: false,
    used,
    limit: limits.projects,
    reason:
      `The ${plan.name} plan allows ${limits.projects} ` +
      `project${limits.projects === 1 ? '' : 's'}.`,
    ...(plan.id === 'basic' ? { upgradeTo: 'pro' as const } : {}),
  }
}

export async function canAddIntegration(env: Env, orgId: string): Promise<Decision> {
  const { plan, limits } = await entitlementFor(env, orgId)
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM integrations WHERE org = ?1 AND revoked_at IS NULL',
  )
    .bind(orgId)
    .first<{ n: number }>()
  const used = row?.n ?? 0

  if (used < limits.integrations) return { allowed: true, used, limit: limits.integrations }

  return {
    allowed: false,
    used,
    limit: limits.integrations,
    reason: `The ${plan.name} plan allows ${limits.integrations} connected account(s).`,
    ...(plan.id === 'basic' ? { upgradeTo: 'pro' as const } : {}),
  }
}

/**
 * A job may only target a project that is actually usable.
 *
 * This is the guard that stops the current failure mode: queueing work for a
 * repository the runner has no credential for, which fails at clone time on the
 * runner rather than being refused up front.
 */
export async function projectIsRunnable(
  env: Env,
  orgId: string,
  slug: string,
): Promise<Decision> {
  const row = await env.DB.prepare(
    `SELECT p.status, i.revoked_at
     FROM projects p JOIN integrations i ON i.id = p.integration_id
     WHERE p.org = ?1 AND p.slug = ?2`,
  )
    .bind(orgId, slug)
    .first<{ status: string; revoked_at: string | null }>()

  if (!row) {
    return { allowed: false, reason: `No project "${slug}" is connected.` }
  }
  if (row.revoked_at) {
    return {
      allowed: false,
      reason: `The integration for "${slug}" was disconnected. Reconnect it to run again.`,
    }
  }
  if (row.status !== 'active') {
    return { allowed: false, reason: `Project "${slug}" is ${row.status}.` }
  }
  return { allowed: true }
}

export async function canQueueJob(env: Env, orgId: string): Promise<Decision> {
  const { plan, limits } = await entitlementFor(env, orgId)
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM jobs WHERE org = ?1 AND status = 'pending'`,
  )
    .bind(orgId)
    .first<{ n: number }>()
  const used = row?.n ?? 0

  if (used < limits.queuedJobs) return { allowed: true, used, limit: limits.queuedJobs }

  return {
    allowed: false,
    used,
    limit: limits.queuedJobs,
    reason: `The ${plan.name} plan allows ${limits.queuedJobs} queued jobs.`,
    ...(plan.id === 'basic' ? { upgradeTo: 'pro' as const } : {}),
  }
}

export async function hasFeature(
  env: Env,
  orgId: string,
  feature: FeatureId,
): Promise<boolean> {
  const { plan } = await entitlementFor(env, orgId)
  return plan.features[feature]
}

/** How far back this org may read run history. */
export async function historyCutoff(env: Env, orgId: string): Promise<string> {
  const { limits } = await entitlementFor(env, orgId)
  const cutoff = new Date(Date.now() - limits.runHistoryDays * 86_400_000)
  return cutoff.toISOString()
}
