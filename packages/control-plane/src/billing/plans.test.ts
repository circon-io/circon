import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  PLANS, DEFAULT_PLAN, isPlanId, planFor, planForPrice, priceIdFor, publicPlans,
} from './plans.ts'

describe('plan definitions', () => {
  test('basic allows one runner, pro allows ten', () => {
    assert.equal(PLANS.basic.limits.runners, 1)
    assert.equal(PLANS.pro.limits.runners, 10)
  })

  test('basic allows one project, pro allows ten', () => {
    assert.equal(PLANS.basic.limits.projects, 1)
    assert.equal(PLANS.pro.limits.projects, 10)
  })

  test('every plan defines every limit, so a new one cannot be forgotten', () => {
    const names = Object.keys(PLANS.basic.limits).sort()
    for (const plan of Object.values(PLANS)) {
      assert.deepEqual(Object.keys(plan.limits).sort(), names, `${plan.id} differs`)
    }
  })

  test('every plan defines every feature, so a new flag cannot be forgotten', () => {
    const featureNames = Object.keys(PLANS.basic.features).sort()
    for (const plan of Object.values(PLANS)) {
      assert.deepEqual(Object.keys(plan.features).sort(), featureNames, `${plan.id} differs`)
    }
  })

  test('pro is a superset of basic — no limit goes backwards on upgrade', () => {
    for (const key of Object.keys(PLANS.basic.limits) as Array<keyof typeof PLANS.basic.limits>) {
      // 0 means "uncapped", so it is not a smaller number.
      const basic = PLANS.basic.limits[key]
      const pro = PLANS.pro.limits[key]
      if (pro === 0 || basic === 0) continue
      assert.ok(pro >= basic, `pro.${key} (${pro}) must not be below basic.${key} (${basic})`)
    }
    for (const [feature, enabled] of Object.entries(PLANS.basic.features)) {
      if (!enabled) continue
      assert.ok(
        PLANS.pro.features[feature as keyof typeof PLANS.pro.features],
        `pro must keep ${feature} that basic has`,
      )
    }
  })

  test('the free plan needs no Stripe price', () => {
    assert.equal(PLANS.basic.stripePriceEnvVar, null)
    assert.equal(PLANS.pro.stripePriceEnvVar, 'STRIPE_PRICE_PRO')
  })
})

describe('resolving a plan', () => {
  test('an unknown or missing plan falls back to the free tier', () => {
    // Never fail open: a corrupt tag must not grant paid limits.
    assert.equal(planFor('enterprise').id, DEFAULT_PLAN)
    assert.equal(planFor(undefined).id, DEFAULT_PLAN)
    assert.equal(planFor(null).id, DEFAULT_PLAN)
    assert.equal(planFor(42).id, DEFAULT_PLAN)
  })

  test('isPlanId guards the union', () => {
    assert.equal(isPlanId('pro'), true)
    assert.equal(isPlanId('Pro'), false)
    assert.equal(isPlanId(''), false)
  })
})

describe('mapping Stripe prices to plans', () => {
  const env = { STRIPE_PRICE_PRO: 'price_live_abc' }

  test('matches the configured price', () => {
    assert.equal(planForPrice('price_live_abc', env), 'pro')
  })

  test('an unknown price maps to nothing rather than guessing', () => {
    // Guessing here would put someone on a tier they did not buy.
    assert.equal(planForPrice('price_someone_elses', env), null)
    assert.equal(planForPrice(null, env), null)
    assert.equal(planForPrice(undefined, env), null)
  })

  test('a price from the wrong mode does not match', () => {
    // The exact failure this indirection exists to prevent: test-mode price,
    // live-mode config, customer silently left on free.
    assert.equal(planForPrice('price_test_abc', env), null)
  })

  test('an unset env var never matches an empty price id', () => {
    assert.equal(planForPrice('', { STRIPE_PRICE_PRO: undefined }), null)
    assert.equal(planForPrice('anything', {}), null)
  })

  test('priceIdFor reads from env, and free has no price', () => {
    assert.equal(priceIdFor('pro', env), 'price_live_abc')
    assert.equal(priceIdFor('basic', env), null)
    assert.equal(priceIdFor('pro', {}), null)
  })
})

describe('the shape sent to the dashboard', () => {
  test('exposes limits and features but no Stripe internals', () => {
    const shipped = publicPlans()
    assert.equal(shipped.length, 2)
    for (const plan of shipped) {
      assert.ok('limits' in plan && 'features' in plan)
      assert.ok(!('stripePriceEnvVar' in plan), 'must not leak env var names')
    }
  })
})
