import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildChecklist, envChecklist, parseEnvExample, parseExternalServices } from './env-checklist.ts'
import { fakeEnv, seedProject } from '../test/fakes.ts'

const TEMPLATE = readFileSync(new URL('../../cli/templates/.env.example', import.meta.url), 'utf8')

describe('env checklist', () => {
  test("reads the template's own .env.example: names, help, groups and local defaults", () => {
    const vars = parseEnvExample(TEMPLATE)
    const byName = new Map(vars.map((v) => [v.name, v]))
    assert.ok(byName.has('CLERK_WEBHOOK_SECRET'))
    assert.match(byName.get('CLERK_WEBHOOK_SECRET')?.help ?? '', /Signing secret/)
    assert.equal(byName.get('CLERK_WEBHOOK_SECRET')?.group, 'Clerk (auth)')
    // One comment covers the variables directly under it.
    assert.match(byName.get('CLERK_ISSUER')?.help ?? '', /JWKS URL/)
    assert.equal(byName.get('EXPO_PUBLIC_API_URL')?.hasDefault, true)
    assert.equal(byName.get('CLOUDFLARE_API_TOKEN')?.hasDefault, false)
    // The file's own preamble is not a variable's help.
    assert.doesNotMatch(byName.get('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY')?.help ?? '', /Never commit/)
  })

  test('reads External services from a plan, ignoring the template comment', () => {
    const prd = [
      '## External services', '',
      '<!-- - EXAMPLE_KEY — from the template comment -->',
      '- STRIPE_SECRET_KEY — charges; Stripe → Developers → API keys',
      '- `EXPO_PUBLIC_MAPS_KEY`: the venue map',
      '', '## Task Backlog', '- [ ] NOT_A_SERVICE',
    ].join('\n')
    assert.deepEqual(parseExternalServices(prd), [
      { name: 'STRIPE_SECRET_KEY', help: 'charges; Stripe → Developers → API keys' },
      { name: 'EXPO_PUBLIC_MAPS_KEY', help: 'the venue map' },
    ])
  })

  test('merges both sources and marks what is stored, defaulted or missing', () => {
    const items = buildChecklist(
      parseEnvExample('# --- Stripe ---\n# Stripe → API keys\nSTRIPE_SECRET_KEY=\nAPI_URL=http://localhost:8787\nSENTRY_DSN=\n'),
      [{ name: 'STRIPE_SECRET_KEY', help: 'Checkout' }, { name: 'MAPS_KEY', help: 'The venue map' }],
      new Set(['SENTRY_DSN']),
    )
    const status = Object.fromEntries(items.map((i) => [i.name, i.status]))
    assert.deepEqual(status, { STRIPE_SECRET_KEY: 'missing', API_URL: 'default', SENTRY_DSN: 'set', MAPS_KEY: 'missing' })
    assert.equal(items.find((i) => i.name === 'STRIPE_SECRET_KEY')?.help, 'Checkout. Stripe → API keys')
    assert.equal(items.find((i) => i.name === 'MAPS_KEY')?.source, 'plan')
  })

  test('before the project is scaffolded, the plan alone drives the list', () => {
    const items = buildChecklist(null, [{ name: 'MAPS_KEY', help: 'The venue map' }], new Set())
    assert.deepEqual(items.map((i) => [i.name, i.status]), [['MAPS_KEY', 'missing']])
  })

  test('the route reads the approved plan and the stored secrets, machine ones included', async () => {
    const { env, db } = fakeEnv()
    seedProject(db, { org: 'org_a', slug: 'acme__shop' })
    // A revoked installation skips GitHub, which leaves the database side under test.
    db.prepare("UPDATE integrations SET revoked_at = '2026-01-01'").run()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO plans (id, org, project_id, version, status, source, prd, created_by, created_at)
       VALUES ('p1', 'org_a', 'prj_acme__shop', 1, 'approved', 'generated', ?1, 'u', ?2)`,
    ).run('## External services\n- MAPS_KEY — map\n- SENTRY_DSN — errors\n', now)
    db.prepare(
      `INSERT INTO secrets (id, org, scope, project_id, name, ciphertext, iv, updated_at, updated_by)
       VALUES ('s1', 'org_a', 'machine', '', 'SENTRY_DSN', 'x', 'y', ?1, 'u')`,
    ).run(now)
    const res = await envChecklist(env, 'org_a', 'prj_acme__shop')
    const body = (await res.json()) as { data: { items: Array<{ name: string; status: string }>; missing: number; foundEnvExample: boolean } }
    assert.deepEqual(body.data.items.map((i) => [i.name, i.status]), [['MAPS_KEY', 'missing'], ['SENTRY_DSN', 'set']])
    assert.equal(body.data.missing, 1)
    assert.equal(body.data.foundEnvExample, false)
    assert.equal((await envChecklist(env, 'org_other', 'prj_acme__shop')).status, 404)
  })
})
