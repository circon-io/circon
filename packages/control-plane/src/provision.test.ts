import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { injectDatabaseId, idFromResult, findByName } from '../scripts/provision.mjs'

const REAL_CONFIG = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')

describe('injecting the D1 id into wrangler.jsonc', () => {
  test('replaces the placeholder in the real config', () => {
    const out = injectDatabaseId(REAL_CONFIG, 'abc-123')
    assert.match(out, /"database_id":\s*"abc-123"/)
    assert.ok(!out.includes('PLACEHOLDER_D1_ID'), 'placeholder must be gone')
  })

  test('is idempotent — re-running does not corrupt the file', () => {
    const once = injectDatabaseId(REAL_CONFIG, 'abc-123')
    const twice = injectDatabaseId(once, 'abc-123')
    assert.equal(once, twice)
  })

  test('a later deploy can change the id', () => {
    const first = injectDatabaseId(REAL_CONFIG, 'first-id')
    const second = injectDatabaseId(first, 'second-id')
    assert.match(second, /"database_id":\s*"second-id"/)
    assert.ok(!second.includes('first-id'))
  })

  test('leaves the rest of the config untouched', () => {
    const out = injectDatabaseId(REAL_CONFIG, 'abc-123')
    for (const marker of ['"name": "RUNNER"', '"class_name": "RunnerDO"', 'new_sqlite_classes']) {
      assert.ok(out.includes(marker), `${marker} should survive`)
    }
    assert.equal(out.split('\n').length, REAL_CONFIG.split('\n').length)
  })

  test('throws rather than silently deploying a placeholder binding', () => {
    assert.throws(
      () => injectDatabaseId('{ "name": "no-d1-here" }', 'abc'),
      /could not find a database_id/,
    )
  })
})

describe('reading the Cloudflare API response', () => {
  test('accepts whichever id field the API returns', () => {
    // The D1 API has used `uuid`; being tolerant here costs nothing and a wrong
    // guess would mean provisioning silently produces no id.
    assert.equal(idFromResult({ uuid: 'a' }), 'a')
    assert.equal(idFromResult({ database_id: 'b' }), 'b')
    assert.equal(idFromResult({ id: 'c' }), 'c')
  })

  test('returns null rather than undefined for junk', () => {
    assert.equal(idFromResult(null), null)
    assert.equal(idFromResult({}), null)
    assert.equal(idFromResult('nope'), null)
  })

  test('finds the database by exact name', () => {
    const list = [
      { name: 'circon-staging', uuid: 'wrong' },
      { name: 'circon', uuid: 'right' },
    ]
    assert.equal(findByName(list, 'circon'), 'right')
  })

  test('a near-miss name does not match', () => {
    // Adopting the wrong database would point production at staging data.
    assert.equal(findByName([{ name: 'circon-staging', uuid: 'x' }], 'circon'), null)
  })

  test('an empty or malformed list yields null, so create runs', () => {
    assert.equal(findByName([], 'circon'), null)
    assert.equal(findByName(null, 'circon'), null)
    assert.equal(findByName(undefined, 'circon'), null)
  })
})
