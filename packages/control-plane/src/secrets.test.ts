import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { fakeEnv, seedRunner, seedProject } from '../test/fakes.ts'
import { seal, open, putSecret, listSecrets, secretsForJob, validSecretName } from './secrets.ts'
import { claimJob, queueJob } from './fleet.ts'
import { pullRequestEvent, releaseReport, approveRelease } from './releases.ts'

const ORG = 'org_a'
const KEY = Buffer.from(new Uint8Array(32).map((_, i) => i * 7)).toString('base64')
const post = (body: unknown) => new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) })

async function data<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { ok: boolean; data: T; error?: unknown }
  assert.equal(body.ok, true, JSON.stringify(body.error))
  return body.data
}

function setup() {
  const ctx = fakeEnv({ SECRETS_MASTER_KEY: KEY })
  seedRunner(ctx.db, { id: 'run_a', org: ORG, lastSeenAt: new Date().toISOString() })
  seedProject(ctx.db, { org: ORG, slug: 'acme__shop' })
  seedProject(ctx.db, { org: ORG, slug: 'acme__blog' })
  return ctx
}

describe('sealing', () => {
  test('round-trips', async () => {
    const { env } = setup()
    const where = { org: ORG, scope: 'project' as const, projectId: 'p', name: 'CLOUDFLARE_API_TOKEN' }
    assert.equal(await open(env, where, await seal(env, where, 'cf-123')), 'cf-123')
  })

  test("a ciphertext moved to another org's row does not open", async () => {
    const { env } = setup()
    const sealed = await seal(env, { org: ORG, scope: 'machine', projectId: '', name: 'K' }, 'v')
    await assert.rejects(open(env, { org: 'org_thief', scope: 'machine', projectId: '', name: 'K' }, sealed))
  })

  test('names that would change the runner itself are refused', () => {
    assert.match(validSecretName('PATH') ?? '', /controls the runner/)
    assert.match(validSecretName('NODE_OPTIONS') ?? '', /controls the runner/)
    assert.match(validSecretName('lower') ?? '', /upper case/)
    assert.equal(validSecretName('CLOUDFLARE_API_TOKEN'), null)
  })
})

describe('secrets in the dashboard', () => {
  test('values are stored sealed and never listed back', async () => {
    const { env, db } = setup()
    await data(await putSecret(post({ scope: 'project', projectId: 'prj_acme__shop', name: 'SENTRY_AUTH_TOKEN', value: 'tok-xyz' }), env, ORG, 'u'))
    const row = db.prepare('SELECT ciphertext FROM secrets').get() as { ciphertext: string }
    assert.ok(!row.ciphertext.includes('tok-xyz'))
    const listed = await data<{ secrets: unknown[] }>(
      await listSecrets(env, ORG, new URL('https://x/api/secrets?scope=project&projectId=prj_acme__shop')),
    )
    assert.ok(!JSON.stringify(listed).includes('tok-xyz'))
    assert.equal(listed.secrets.length, 1)
  })

  test("another org's project cannot receive secrets", async () => {
    const { env } = setup()
    const res = await putSecret(post({ scope: 'project', projectId: 'prj_acme__shop', name: 'X', value: 'v' }), env, 'org_other', 'u')
    assert.equal(res.status, 404)
  })
})

describe('secrets for a job', () => {
  test("a runner gets machine secrets plus its job's project, and nothing else", async () => {
    const { env } = setup()
    await putSecret(post({ scope: 'machine', name: 'ANTHROPIC_API_KEY', value: 'sk-org' }), env, ORG, 'u')
    await putSecret(post({ scope: 'project', projectId: 'prj_acme__shop', name: 'CLOUDFLARE_API_TOKEN', value: 'cf-shop' }), env, ORG, 'u')
    await putSecret(post({ scope: 'project', projectId: 'prj_acme__blog', name: 'CLOUDFLARE_API_TOKEN', value: 'cf-blog' }), env, ORG, 'u')

    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'u')
    const { job } = await data<{ job: { id: string } }>(await claimJob(env, 'run_a', ORG))
    const { secrets } = await data<{ secrets: Record<string, string> }>(await secretsForJob(env, 'run_a', ORG, job.id))
    assert.deepEqual(secrets, { ANTHROPIC_API_KEY: 'sk-org', CLOUDFLARE_API_TOKEN: 'cf-shop' })
  })

  test('a job the runner did not claim, or that already finished, yields nothing', async () => {
    const { env, db } = setup()
    seedRunner(db, { id: 'run_b', org: ORG, lastSeenAt: new Date().toISOString() })
    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'u')
    const { job } = await data<{ job: { id: string } }>(await claimJob(env, 'run_a', ORG))
    assert.equal((await secretsForJob(env, 'run_b', ORG, job.id)).status, 404)
    db.prepare(`UPDATE jobs SET status = 'done'`).run()
    assert.equal((await secretsForJob(env, 'run_a', ORG, job.id)).status, 404)
  })
})

describe('pull request state', () => {
  test('a merged run PR is recorded; a plan PR merging tells runners', async () => {
    const { env, db } = setup()
    db.prepare(`INSERT INTO integrations (id, org, provider, external_id, created_at) VALUES ('itg_x', ?1, 'github', '77', ?2)`)
      .run(ORG, new Date().toISOString())
    db.prepare(`INSERT INTO runs (id, runner_id, org, project_slug, started_at, pr_url) VALUES ('r1', 'run_a', ?1, 'acme__shop', ?2, 'https://github.com/acme/shop/pull/3')`)
      .run(ORG, new Date().toISOString())
    db.prepare(`INSERT INTO plans (id, org, project_id, version, status, source, prd, created_by, created_at, pr_url)
                VALUES ('pln', ?1, 'prj_acme__shop', 1, 'approved', 'generated', '#', 'u', ?2, 'https://github.com/acme/shop/pull/4')`)
      .run(ORG, new Date().toISOString())

    const told: string[] = []
    const notify = async (_org: string, slug: string) => { told.push(slug) }
    await pullRequestEvent(env, '77', { action: 'closed', pull_request: { html_url: 'https://github.com/acme/shop/pull/3', merged: true } }, notify)
    await pullRequestEvent(env, '77', { action: 'closed', pull_request: { html_url: 'https://github.com/acme/shop/pull/4', merged: true } }, notify)

    assert.equal((db.prepare(`SELECT pr_state FROM runs WHERE id = 'r1'`).get() as { pr_state: string }).pr_state, 'merged')
    assert.deepEqual(told, ['acme__shop'])
  })

  test("a webhook from an unknown installation changes nothing", async () => {
    const { env, db } = setup()
    db.prepare(`INSERT INTO runs (id, runner_id, org, project_slug, started_at, pr_url) VALUES ('r1', 'run_a', ?1, 'acme__shop', ?2, 'https://github.com/acme/shop/pull/3')`)
      .run(ORG, new Date().toISOString())
    await pullRequestEvent(env, '999', { action: 'closed', pull_request: { html_url: 'https://github.com/acme/shop/pull/3', merged: true } }, async () => {})
    assert.equal((db.prepare(`SELECT pr_state FROM runs WHERE id = 'r1'`).get() as { pr_state: string | null }).pr_state, null)
  })
})

describe('release report', () => {
  let realFetch: typeof fetch | null = null
  afterEach(() => {
    if (realFetch) globalThis.fetch = realFetch
  })

  async function withGithub(pull: { number: number } | null, mergeOk = true) {
    realFetch = globalThis.fetch
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )
    const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
    const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/access_tokens')) return Response.json({ token: 't', expires_at: '2099-01-01T00:00:00Z' })
      if (url.includes('/pulls?state=open')) {
        assert.match(url, /head=acme%3Achangeset-release%2Fmain/)
        return Response.json(pull ? [{ number: pull.number, html_url: `https://github.com/acme/shop/pull/${pull.number}`, title: 'chore: version packages', body: '## 1.1.0\n- cart', created_at: '2026-10-01T00:00:00Z' }] : [])
      }
      if (url.endsWith('/merge') && init?.method === 'PUT') {
        return mergeOk ? Response.json({ sha: 'rel-sha', merged: true }) : Response.json({ message: 'Required status check "ci" is failing' }, { status: 405 })
      }
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch
    return pem
  }

  test('shows the pending changelog and the runs merged since the last release', async () => {
    const pem = await withGithub({ number: 9 })
    const { env, db } = fakeEnv({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: pem, SECRETS_MASTER_KEY: KEY })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    seedRunner(db, { id: 'x', org: ORG })
    db.prepare(`INSERT INTO runs (id, runner_id, org, project_slug, started_at, finished_at, pr_state, cost_usd, screenshots)
                VALUES ('r1', 'x', ?1, 'acme__shop', ?2, ?2, 'merged', 1.5, ?3)`)
      .run(ORG, new Date().toISOString(), JSON.stringify(['https://github.com/acme/shop/blob/b/s.png?raw=true']))
    const report = await data<{ pending: { body: string }; runs: Array<{ screenshots: string[] }>; costUsd: number; devBuild: unknown }>(
      await releaseReport(env, ORG, 'prj_acme__shop'),
    )
    assert.match(report.pending.body, /1\.1\.0/)
    assert.equal(report.runs[0]?.screenshots.length, 1)
    assert.equal(report.costUsd, 1.5)
    assert.equal(report.devBuild, null, 'no Codemagic secrets, no build')
  })

  test('approval merges the version PR and records the release', async () => {
    const pem = await withGithub({ number: 9 })
    const { env, db } = fakeEnv({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: pem })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    await data(await approveRelease(env, ORG, 'owner', 'prj_acme__shop'))
    const row = db.prepare('SELECT pr_number, merged_sha FROM releases').get() as { pr_number: number; merged_sha: string }
    assert.deepEqual({ ...row }, { pr_number: 9, merged_sha: 'rel-sha' })
  })

  test("GitHub's own checks still apply: a refused merge is reported, not recorded", async () => {
    const pem = await withGithub({ number: 9 }, false)
    const { env, db } = fakeEnv({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: pem })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    const res = await approveRelease(env, ORG, 'owner', 'prj_acme__shop')
    assert.equal(res.status, 409)
    assert.match(((await res.json()) as { error: { message: string } }).error.message, /status check/)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM releases').get()?.['n'], 0)
  })

  test('nothing to release is said plainly', async () => {
    const pem = await withGithub(null)
    const { env, db } = fakeEnv({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: pem })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    assert.equal((await approveRelease(env, ORG, 'owner', 'prj_acme__shop')).status, 409)
  })
})
