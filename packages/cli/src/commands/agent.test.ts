import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PendingRefresh } from './agent.ts'

describe('pending refresh', () => {
  test('a config change is taken once', () => {
    const r = new PendingRefresh(() => 'acme__shop')
    r.note({ type: 'config-changed' })
    assert.deepEqual(r.take(), { config: true, prd: false })
    assert.deepEqual(r.take(), { config: false, prd: false })
  })

  test("only the running project's PRD counts", () => {
    const r = new PendingRefresh(() => 'acme__shop')
    r.note({ type: 'prd-changed', project: 'other__repo' })
    assert.deepEqual(r.take(), { config: false, prd: false })
    r.note({ type: 'prd-changed', project: 'acme__shop' })
    assert.deepEqual(r.take(), { config: false, prd: true })
  })

  test('nothing running, nothing to sync', () => {
    const r = new PendingRefresh(() => null)
    r.note({ type: 'prd-changed', project: 'acme__shop' })
    assert.deepEqual(r.take(), { config: false, prd: false })
  })
})
