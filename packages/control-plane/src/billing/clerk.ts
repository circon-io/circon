import type { Env } from '../env.ts'
import { DEFAULT_PLAN, isPlanId, type PlanId } from './plans.ts'

/**
 * Clerk organisation metadata is where the Stripe relationship is recorded.
 *
 * Stripe owns *whether* someone is paying; Clerk owns *who they are*. Tagging
 * the org with the resulting plan means every request already carries the
 * answer, and there is no second database to keep in step with Stripe.
 *
 * Written to `publicMetadata` so the dashboard can read it straight from the
 * session without a round trip. Nothing sensitive goes here — the Stripe
 * customer id is an opaque handle, not a credential.
 */

export interface BillingTag {
  plan: PlanId
  /** Stripe's own status, kept verbatim rather than collapsed to a boolean. */
  status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | string
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  /** ISO. Lets us spot a webhook that arrived out of order. */
  updatedAt?: string
}

const CLERK_API = 'https://api.clerk.com/v1'

/**
 * Direct REST rather than @clerk/backend: this is two endpoints, and the SDK
 * would add meaningful weight to a Worker bundle for no benefit.
 */
async function clerk(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY is not set')
  return fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      'content-type': 'application/json',
    },
  })
}

function readTag(metadata: unknown): BillingTag {
  if (typeof metadata !== 'object' || metadata === null) return { plan: DEFAULT_PLAN }
  const billing = (metadata as Record<string, unknown>)['billing']
  if (typeof billing !== 'object' || billing === null) return { plan: DEFAULT_PLAN }

  const tag = billing as Record<string, unknown>
  return {
    plan: isPlanId(tag['plan']) ? tag['plan'] : DEFAULT_PLAN,
    ...(typeof tag['status'] === 'string' ? { status: tag['status'] } : {}),
    ...(typeof tag['stripeCustomerId'] === 'string'
      ? { stripeCustomerId: tag['stripeCustomerId'] }
      : {}),
    ...(typeof tag['stripeSubscriptionId'] === 'string'
      ? { stripeSubscriptionId: tag['stripeSubscriptionId'] }
      : {}),
    ...(typeof tag['updatedAt'] === 'string' ? { updatedAt: tag['updatedAt'] } : {}),
  }
}

/**
 * An org's billing tag. Falls back to the free plan on any failure — a Clerk
 * outage must not hand out unlimited runners, and must not lock out a paying
 * customer's existing ones either, which is why enforcement only ever blocks
 * *new* enrolments.
 */
export async function readBillingTag(env: Env, orgId: string): Promise<BillingTag> {
  try {
    // A personal account has no organisation; its id is the user id.
    const isOrg = orgId.startsWith('org_')
    const res = await clerk(env, `${isOrg ? '/organizations' : '/users'}/${orgId}`)
    if (!res.ok) return { plan: DEFAULT_PLAN }

    const body = (await res.json()) as { public_metadata?: unknown }
    return readTag(body.public_metadata)
  } catch {
    return { plan: DEFAULT_PLAN }
  }
}

/**
 * Record the plan against the org.
 *
 * Merges rather than replaces: Clerk's PATCH overwrites the whole metadata
 * object, so anything else stored there would be destroyed by a naive write.
 */
export async function writeBillingTag(
  env: Env,
  orgId: string,
  tag: BillingTag,
): Promise<boolean> {
  const isOrg = orgId.startsWith('org_')
  const path = `${isOrg ? '/organizations' : '/users'}/${orgId}`

  let existing: Record<string, unknown> = {}
  try {
    const current = await clerk(env, path)
    if (current.ok) {
      const body = (await current.json()) as { public_metadata?: Record<string, unknown> }
      existing = body.public_metadata ?? {}
    }
  } catch {
    /* proceed with an empty base rather than failing the webhook */
  }

  const res = await clerk(env, path, {
    method: 'PATCH',
    body: JSON.stringify({
      public_metadata: {
        ...existing,
        billing: { ...tag, updatedAt: new Date().toISOString() },
      },
    }),
  })
  return res.ok
}

/** Find the org a Stripe customer belongs to, for webhooks that only carry it. */
export async function findOrgByStripeCustomer(
  env: Env,
  customerId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT org FROM stripe_customers WHERE stripe_customer_id = ?1',
  )
    .bind(customerId)
    .first<{ org: string }>()
  return row?.org ?? null
}

export async function linkStripeCustomer(
  env: Env,
  orgId: string,
  customerId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO stripe_customers (stripe_customer_id, org, created_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT (stripe_customer_id) DO UPDATE SET org = excluded.org`,
  )
    .bind(customerId, orgId, new Date().toISOString())
    .run()
}
