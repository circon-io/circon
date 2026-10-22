import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PendingRefresh } from './agent.ts'

describe('pending refresh', () => {
  test('a config change is taken once', () => {
    const r = new PendingRefresh(() => 'acme__shop')
    r.note({ type: 'config-changed' })
    assert.deepEqual(r.take(), { config: true, prd: false, secrets: false })
    assert.deepEqual(r.take(), { config: false, prd: false, secrets: false })
  })

  test("only the running project's PRD counts", () => {
    const r = new PendingRefresh(() => 'acme__shop')
    r.note({ type: 'prd-changed', project: 'other__repo' })
    assert.deepEqual(r.take(), { config: false, prd: false, secrets: false })
    r.note({ type: 'prd-changed', project: 'acme__shop' })
    assert.deepEqual(r.take(), { config: false, prd: true, secrets: false })
  })

  test('nothing running, nothing to sync', () => {
    const r = new PendingRefresh(() => null)
    r.note({ type: 'prd-changed', project: 'acme__shop' })
    assert.deepEqual(r.take(), { config: false, prd: false, secrets: false })
  })
})

test('an answered credential request for the running project is picked up', () => {
  const r = new PendingRefresh(() => 'acme__shop')
  r.note({ type: 'secrets-changed', project: 'acme__shop' })
  assert.equal(r.take().secrets, true)
})

test("a machine secret reaches every project's run; another project's secret does not", () => {
  const r = new PendingRefresh(() => 'acme__shop')
  r.note({ type: 'secrets-changed', project: 'acme__blog' })
  assert.equal(r.take().secrets, false)
  r.note({ type: 'secrets-changed' })
  assert.equal(r.take().secrets, true)
})
