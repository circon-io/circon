import Stripe from 'stripe'
import type { Env } from '../env.ts'
import { fail, ok } from '../env.ts'
import { planForPrice, priceIdFor, type PlanId } from './plans.ts'
import { findOrgByStripeCustomer, linkStripeCustomer, writeBillingTag } from './clerk.ts'
import { entitlementFor } from './entitlements.ts'

/**
 * Stripe on Workers.
 *
 * The default SDK transport is `node:https` and its crypto is Node's, neither
 * of which exists here — hence the fetch HTTP client and the WebCrypto
 * provider. Webhook signatures are verified with `constructEventAsync`, which
 * is the async form required when the crypto provider is WebCrypto.
 */

function client(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}

/** Start a checkout for an upgrade. Returns the URL the browser should visit. */
export async function createCheckout(
  env: Env,
  orgId: string,
  userEmail: string | undefined,
  planId: PlanId,
  returnTo: string,
): Promise<Response> {
  const price = priceIdFor(planId, env as unknown as Record<string, string | undefined>)
  if (!price) return fail('plan_not_purchasable', `No Stripe price configured for ${planId}.`)

  const stripe = client(env)
  const existing = await entitlementFor(env, orgId)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: `${returnTo}?upgraded=1`,
    cancel_url: returnTo,
    // Reuse the customer when we already know it, so a second subscription is
    // not created against a new customer record for the same organisation.
    ...(existing.tag.stripeCustomerId
      ? { customer: existing.tag.stripeCustomerId }
      : userEmail
        ? { customer_email: userEmail }
        : {}),
    // The link back to Clerk. Set on both the session and the subscription so
    // every webhook, whichever object it carries, can find the organisation.
    client_reference_id: orgId,
    metadata: { clerk_org_id: orgId },
    subscription_data: { metadata: { clerk_org_id: orgId } },
  })

  if (!session.url) return fail('checkout_failed', 'Stripe did not return a checkout URL.', 502)
  return ok({ url: session.url })
}

/** The Stripe-hosted page for changing card, invoices and cancellation. */
export async function createPortal(
  env: Env,
  orgId: string,
  returnTo: string,
): Promise<Response> {
  const { tag } = await entitlementFor(env, orgId)
  if (!tag.stripeCustomerId) {
    return fail('no_subscription', 'This organisation has no Stripe customer yet.', 409)
  }

  const stripe = client(env)
  const session = await stripe.billingPortal.sessions.create({
    customer: tag.stripeCustomerId,
    return_url: returnTo,
  })
  return ok({ url: session.url })
}

/**
 * Resolve the Clerk org for a webhook event.
 *
 * Metadata is the fast path; the customer table is the fallback for events that
 * carry only a customer id. Returning null rather than guessing is deliberate —
 * tagging the wrong organisation as paying is worse than dropping the event and
 * letting Stripe retry.
 */
async function orgForEvent(
  env: Env,
  subscription: Stripe.Subscription | null,
  customerId: string | null,
): Promise<string | null> {
  const fromMetadata = subscription?.metadata?.['clerk_org_id']
  if (typeof fromMetadata === 'string' && fromMetadata) return fromMetadata
  if (customerId) return findOrgByStripeCustomer(env, customerId)
  return null
}

function customerIdOf(value: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

/**
 * The webhook.
 *
 * Unauthenticated by necessity — Stripe cannot present a Clerk session — so the
 * signature *is* the authentication. An unverified body is never parsed.
 */
export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return fail('not_configured', 'Billing webhooks are not configured.', 503)
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) return fail('unsigned', 'Missing stripe-signature header.', 400)

  // Must be the raw body: any reserialisation changes the bytes and the
  // signature will not match.
  const raw = await request.text()

  let event: Stripe.Event
  try {
    event = await client(env).webhooks.constructEventAsync(
      raw,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  } catch (error) {
    console.error('stripe signature rejected', error)
    return fail('bad_signature', 'Signature verification failed.', 400)
  }

  const stripe = client(env)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const orgId =
        (typeof session.client_reference_id === 'string' && session.client_reference_id) ||
        (typeof session.metadata?.['clerk_org_id'] === 'string'
          ? session.metadata['clerk_org_id']
          : null)
      const customerId = customerIdOf(session.customer)
      if (!orgId || !customerId) break

      // Record the mapping now, so later events that carry only a customer id
      // can still be attributed.
      await linkStripeCustomer(env, orgId, customerId)

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription?.id ?? null)

      let plan: PlanId | null = null
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        plan = planForPrice(
          subscription.items.data[0]?.price.id,
          env as unknown as Record<string, string | undefined>,
        )
      }

      await writeBillingTag(env, orgId, {
        plan: plan ?? 'pro',
        status: 'active',
        stripeCustomerId: customerId,
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
      })
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object
      const customerId = customerIdOf(subscription.customer)
      const orgId = await orgForEvent(env, subscription, customerId)
      if (!orgId) break

      if (customerId) await linkStripeCustomer(env, orgId, customerId)

      const plan = planForPrice(
        subscription.items.data[0]?.price.id,
        env as unknown as Record<string, string | undefined>,
      )

      await writeBillingTag(env, orgId, {
        // An unrecognised price means a plan we do not model; fall back rather
        // than granting whatever the last known tier was.
        plan: plan ?? 'basic',
        status: subscription.status,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        stripeSubscriptionId: subscription.id,
      })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const customerId = customerIdOf(subscription.customer)
      const orgId = await orgForEvent(env, subscription, customerId)
      if (!orgId) break

      // Down to free, not to nothing. Existing runners keep working; no new
      // ones can be enrolled beyond the free limit.
      await writeBillingTag(env, orgId, {
        plan: 'basic',
        status: 'canceled',
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      })
      break
    }

    default:
      // Everything else is acknowledged so Stripe stops retrying it.
      break
  }

  return ok({ received: event.type })
}
