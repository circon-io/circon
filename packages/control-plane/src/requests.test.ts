import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeEnv, seedRunner, seedProject } from '../test/fakes.ts'
import { createRequest, listRequests, fulfillRequest, dismissRequest } from './requests.ts'
import { secretsForJob } from './secrets.ts'
import { claimJob, queueJob, recordRun, overview, listRuns } from './fleet.ts'

const ORG = 'org_a'
const KEY = Buffer.from(new Uint8Array(32).map((_, i) => i * 3)).toString('base64')
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
  return ctx
}

type Row = { id: string; name: string; status: string; reason: string; project_slug: string }

describe('agent requests', () => {
  test('an agent asks, a human answers, and the running job receives it', async () => {
    const { env, sent } = setup()
    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'u')
    const { job } = await data<{ job: { id: string } }>(await claimJob(env, 'run_a', ORG))

    const asked = await data<{ status: string }>(
      await createRequest(post({ project: 'acme__shop', name: 'STRIPE_SECRET_KEY', reason: 'Checkout needs it', runId: 'r1' }), env, ORG),
    )
    assert.equal(asked.status, 'pending')

    const { requests } = await data<{ requests: Row[] }>(await listRequests(env, ORG, new URL('https://x/api/requests?status=pending')))
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.project_slug, 'acme__shop')

    await data(await fulfillRequest(post({ value: 'sk_test_123' }), env, ORG, 'owner', requests[0]?.id ?? ''))
    assert.ok(sent.some((s) => JSON.stringify(s.body) === JSON.stringify({ type: 'secrets-changed', project: 'acme__shop' })))

    const { secrets } = await data<{ secrets: Record<string, string> }>(await secretsForJob(env, 'run_a', ORG, job.id))
    assert.equal(secrets['STRIPE_SECRET_KEY'], 'sk_test_123')
  })

  test('asking twice keeps one open request with the latest reason', async () => {
    const { env } = setup()
    await createRequest(post({ project: 'acme__shop', name: 'MAPS_KEY', reason: 'first' }), env, ORG)
    await createRequest(post({ project: 'acme__shop', name: 'MAPS_KEY', reason: 'second' }), env, ORG)
    const { requests } = await data<{ requests: Row[] }>(await listRequests(env, ORG, new URL('https://x/api/requests')))
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.reason, 'second')
  })

  test('a credential that already exists is reported as available, not requested', async () => {
    const { env } = setup()
    await createRequest(post({ project: 'acme__shop', name: 'MAPS_KEY', reason: 'x' }), env, ORG)
    const { requests } = await data<{ requests: Row[] }>(await listRequests(env, ORG, new URL('https://x/api/requests')))
    await fulfillRequest(post({ value: 'v' }), env, ORG, 'u', requests[0]?.id ?? '')
    const again = await data<{ status: string }>(await createRequest(post({ project: 'acme__shop', name: 'MAPS_KEY', reason: 'x' }), env, ORG))
    assert.equal(again.status, 'available')
  })

  test('names that would reconfigure the runner are refused', async () => {
    const { env } = setup()
    const res = await createRequest(post({ project: 'acme__shop', name: 'PATH', reason: 'x' }), env, ORG)
    assert.equal(res.status, 400)
  })

  test("another org's request cannot be answered or dismissed", async () => {
    const { env } = setup()
    await createRequest(post({ project: 'acme__shop', name: 'MAPS_KEY', reason: 'x' }), env, ORG)
    const { requests } = await data<{ requests: Row[] }>(await listRequests(env, ORG, new URL('https://x/api/requests')))
    const id = requests[0]?.id ?? ''
    assert.equal((await fulfillRequest(post({ value: 'v' }), env, 'org_other', 'u', id)).status, 404)
    assert.equal((await dismissRequest(env, 'org_other', 'u', id)).status, 404)
    await data(await dismissRequest(env, ORG, 'u', id))
    const after = await data<{ requests: Row[] }>(await listRequests(env, ORG, new URL('https://x/api/requests?status=pending')))
    assert.equal(after.requests.length, 0)
  })
})

describe('feedback loops on runs', () => {
  test('the tiers a run exercised are kept, and only known tiers', async () => {
    const { env } = setup()
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop', gateTiers: ['typecheck', 'web UI', 'rm -rf'] }), env, 'run_a', ORG))
    const { runs } = await data<{ runs: Array<{ gate_tiers: string[] }> }>(await listRuns(env, ORG, new URL('https://x/api/runs')))
    assert.deepEqual(runs[0]?.gate_tiers, ['typecheck', 'web UI'])
  })
})

describe('overview', () => {
  test('summarizes runs, spend and what waits on a human', async () => {
    const { env } = setup()
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop', outcome: 'complete', costUsd: 2 }), env, 'run_a', ORG))
    await data(await recordRun(post({ runId: 'r2', projectSlug: 'acme__shop', outcome: 'stuck', costUsd: 1 }), env, 'run_a', ORG))
    await data(await recordRun(post({ runId: 'r3', projectSlug: 'acme__shop' }), env, 'run_a', ORG))
    await createRequest(post({ project: 'acme__shop', name: 'MAPS_KEY', reason: 'x' }), env, ORG)
    const o = await data<{ runsLast7d: number; running: number; successRate7d: number; spentLast24h: number; pendingRequests: number }>(
      await overview(env, ORG),
    )
    assert.equal(o.runsLast7d, 3)
    assert.equal(o.running, 1)
    assert.equal(o.successRate7d, 0.5)
    assert.equal(o.spentLast24h, 3)
    assert.equal(o.pendingRequests, 1)
  })
})
