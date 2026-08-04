/**
 * The single source of truth for what each plan allows.
 *
 * Everything that differs between tiers lives here — limits, features and which
 * Stripe price the plan maps to. Adding a tier or changing a limit is an edit
 * to this file and nothing else: enrollment, the dashboard and the upgrade
 * prompt all read from it.
 *
 * Deliberately *not* in the database. A limit is product policy, not state, and
 * putting it in D1 means two places to change it and a migration to raise it.
 */

export type PlanId = 'basic' | 'pro'

export type FeatureId =
  | 'liveLogs'
  | 'jobQueue'
  | 'prioritySupport'
  | 'iosRunner'

export interface PlanLimits {
  /** Enrolled, non-revoked runners. The headline limit. */
  runners: number
  /** Connected repositories. A project is one repo from one integration. */
  projects: number
  /** Connected provider accounts. One GitHub org is enough for most people. */
  integrations: number
  /** Jobs that may sit in the queue at once. */
  queuedJobs: number
  /** How far back run history is readable. */
  runHistoryDays: number
  /** 0 means no cap imposed by the plan; the runner's own budget still applies. */
  monthlySpendCapUsd: number
}

export interface Plan {
  id: PlanId
  name: string
  /** Display only. Stripe remains the authority on what is actually charged. */
  priceLabel: string
  limits: PlanLimits
  features: Record<FeatureId, boolean>
  /** Env var holding the Stripe price id, so ids differ per environment. */
  stripePriceEnvVar: string | null
}

export const PLANS: Record<PlanId, Plan> = {
  basic: {
    id: 'basic',
    name: 'Basic',
    priceLabel: 'Free',
    limits: {
      runners: 1,
      projects: 1,
      integrations: 1,
      queuedJobs: 3,
      runHistoryDays: 7,
      monthlySpendCapUsd: 0,
    },
    features: {
      liveLogs: true,
      jobQueue: true,
      prioritySupport: false,
      iosRunner: false,
    },
    stripePriceEnvVar: null,
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    priceLabel: 'Paid',
    limits: {
      runners: 10,
      projects: 10,
      integrations: 3,
      queuedJobs: 50,
      runHistoryDays: 90,
      monthlySpendCapUsd: 0,
    },
    features: {
      liveLogs: true,
      jobQueue: true,
      prioritySupport: true,
      iosRunner: true,
    },
    stripePriceEnvVar: 'STRIPE_PRICE_PRO',
  },
}

/** What an org falls back to: never nothing, so a billing outage degrades to free. */
export const DEFAULT_PLAN: PlanId = 'basic'

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && value in PLANS
}

export function planFor(id: unknown): Plan {
  return isPlanId(id) ? PLANS[id] : PLANS[DEFAULT_PLAN]
}

/**
 * Which plan a Stripe price belongs to.
 *
 * Resolved from environment rather than hard-coded, because test and live mode
 * have different price ids and hard-coding one guarantees the other silently
 * fails to match — leaving a paying customer on the free tier.
 */
export function planForPrice(
  priceId: string | null | undefined,
  env: Record<string, string | undefined>,
): PlanId | null {
  if (!priceId) return null
  for (const plan of Object.values(PLANS)) {
    if (!plan.stripePriceEnvVar) continue
    if (env[plan.stripePriceEnvVar] && env[plan.stripePriceEnvVar] === priceId) {
      return plan.id
    }
  }
  return null
}

export function priceIdFor(
  planId: PlanId,
  env: Record<string, string | undefined>,
): string | null {
  const plan = PLANS[planId]
  if (!plan.stripePriceEnvVar) return null
  return env[plan.stripePriceEnvVar] ?? null
}

/** Serializable shape for the dashboard, so it never imports this module. */
export function publicPlans() {
  return Object.values(PLANS).map((plan) => ({
    id: plan.id,
    name: plan.name,
    priceLabel: plan.priceLabel,
    limits: plan.limits,
    features: plan.features,
  }))
}
