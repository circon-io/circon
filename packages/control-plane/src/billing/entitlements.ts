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
