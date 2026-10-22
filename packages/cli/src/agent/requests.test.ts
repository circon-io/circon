import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSecretRequests } from './requests.ts'

test('reads requests in any dash style, once each', () => {
  const notes = [
    'Built the checkout screen.',
    'NEEDS-SECRET: STRIPE_SECRET_KEY — checkout calls the Stripe API',
    'NEEDS-SECRET: MAPS_KEY - store locator',
    'NEEDS-SECRET: STRIPE_SECRET_KEY — asked again',
    'NEEDS-SECRET: lower_case — ignored',
    'NEEDS-SECRET: SENTRY_DSN',
  ].join('\n')
  assert.deepEqual(parseSecretRequests(notes), [
    { name: 'STRIPE_SECRET_KEY', reason: 'checkout calls the Stripe API' },
    { name: 'MAPS_KEY', reason: 'store locator' },
    { name: 'SENTRY_DSN', reason: 'requested by the agent' },
  ])
})
