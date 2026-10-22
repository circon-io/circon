import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeEnv, seedRunner, seedProject } from '../test/fakes.ts'
import {
  claimJob, queueJob, recordRun, listRuns, getRun, putSettings, putRunnerConfig, getRunnerConfig, getProjectConfig,
  putProjectConfig, commandRunner, runnerConfig, DARK_RUNNER_MS,
} from './fleet.ts'
import { upsertIntegration } from './integrations/routes.ts'

const ORG = 'org_a'
const now = () => new Date().toISOString()
const post = (body: unknown) => new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) })

async function data<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { ok: boolean; data: T; error?: unknown }
  assert.equal(body.ok, true, JSON.stringify(body.error))
  return body.data
}

function setup() {
  const ctx = fakeEnv()
  seedRunner(ctx.db, { id: 'run_a', org: ORG, lastSeenAt: now() })
  seedRunner(ctx.db, { id: 'run_b', org: ORG, lastSeenAt: now() })
  seedProject(ctx.db, { org: ORG, slug: 'acme__shop' })
  return ctx
}

type Job = { id: string; projectSlug: string; maxLoops: number; config: Record<string, unknown> } | null

describe('queueing and claiming', () => {
  test('an untargeted job goes to whichever runner asks first', async () => {
    const { env } = setup()
    await data(await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'user'))
    const first = await data<{ job: Job }>(await claimJob(env, 'run_a', ORG))
    const second = await data<{ job: Job }>(await claimJob(env, 'run_b', ORG))
    assert.equal(first.job?.projectSlug, 'acme__shop')
    assert.equal(second.job, null)
  })

  test('a job aimed at one runner is invisible to the others', async () => {
    const { env } = setup()
    await data(await queueJob(post({ projectSlug: 'acme__shop', runnerId: 'run_b' }), env, ORG, 'user'))
    assert.equal((await data<{ job: Job }>(await claimJob(env, 'run_a', ORG))).job, null)
    assert.equal((await data<{ job: Job }>(await claimJob(env, 'run_b', ORG))).job?.projectSlug, 'acme__shop')
  })

  test('queueing nudges the runners so nobody waits for the next poll', async () => {
    const { env, sent } = setup()
    await queueJob(post({ projectSlug: 'acme__shop', runnerId: 'run_a' }), env, ORG, 'user')
    assert.deepEqual(
      sent.filter((s) => s.path === '/command').map((s) => [s.runnerId, s.body]),
      [['run_a', { type: 'command', command: 'run' }]],
    )
  })

  test("a runner from another org cannot be targeted", async () => {
    const { env, db } = setup()
    seedRunner(db, { id: 'run_x', org: 'org_other' })
    const res = await queueJob(post({ projectSlug: 'acme__shop', runnerId: 'run_x' }), env, ORG, 'user')
    assert.equal(res.status, 404)
  })

  test('an absurd iteration count is refused', async () => {
    const { env } = setup()
    const res = await queueJob(post({ projectSlug: 'acme__shop', maxLoops: 100_000 }), env, ORG, 'user')
    assert.equal(res.status, 400)
  })

  test('the claim carries the layered config: org < runner < project', async () => {
    const { env } = setup()
    await data(await putSettings(post({ config: { budgetPerRunUsd: 10, budgetPerDayUsd: 40 } }), env, ORG, 'user'))
    await data(await putRunnerConfig(post({ config: { iosRunnerMode: 'device', budgetPerRunUsd: 5 } }), env, ORG, 'run_a'))
    await data(await putProjectConfig(post({ config: { budgetPerRunUsd: 2 } }), env, ORG, 'prj_acme__shop'))
    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'user')

    const { job } = await data<{ job: Job }>(await claimJob(env, 'run_a', ORG))
    assert.deepEqual(job?.config, { budgetPerRunUsd: 2, budgetPerDayUsd: 40, iosRunnerMode: 'device' })
  })

  test('a layer reads back with what it inherits, and only from its own org', async () => {
    const { env } = setup()
    await data(await putSettings(post({ config: { skipTiers: ['ios UI'] } }), env, ORG, 'user'))
    await data(await putRunnerConfig(post({ config: { verifyEvery: 3 } }), env, ORG, 'run_a'))
    const runner = await data<{ config: unknown; inherited: unknown }>(await getRunnerConfig(env, ORG, 'run_a'))
    assert.deepEqual(runner, { config: { verifyEvery: 3 }, inherited: { skipTiers: ['ios UI'] } })
    const project = await data<{ inherited: unknown }>(await getProjectConfig(env, ORG, 'prj_acme__shop'))
    assert.deepEqual(project.inherited, { skipTiers: ['ios UI'] })
    assert.equal((await getRunnerConfig(env, 'org_other', 'run_a')).status, 404)
  })

  test('a project can turn back on a loop the org skips', async () => {
    const { env } = setup()
    await data(await putSettings(post({ config: { skipTiers: ['ios UI'] } }), env, ORG, 'user'))
    await data(await putProjectConfig(post({ config: { skipTiers: [] } }), env, ORG, 'prj_acme__shop'))
    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'user')
    const { job } = await data<{ job: Job }>(await claimJob(env, 'run_a', ORG))
    assert.deepEqual(job?.config.skipTiers, [])
  })
})

describe('jobs that cannot finish', () => {
  test("a dark runner's job goes back to the queue for another machine", async () => {
    const { env, db } = setup()
    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'user')
    await data(await claimJob(env, 'run_a', ORG))
    const longAgo = new Date(Date.now() - DARK_RUNNER_MS - 60_000).toISOString()
    db.prepare('UPDATE runners SET last_seen_at = ?1 WHERE id = ?2').run(longAgo, 'run_a')

    const { job } = await data<{ job: Job }>(await claimJob(env, 'run_b', ORG))
    assert.equal(job?.projectSlug, 'acme__shop')
  })

  test('a live runner keeps its job', async () => {
    const { env } = setup()
    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'user')
    await data(await claimJob(env, 'run_a', ORG))
    assert.equal((await data<{ job: Job }>(await claimJob(env, 'run_b', ORG))).job, null)
  })

  test('a job the caller itself still holds died with its process: abandoned, not re-run', async () => {
    const { env, db } = setup()
    await queueJob(post({ projectSlug: 'acme__shop' }), env, ORG, 'user')
    const { job } = await data<{ job: Job }>(await claimJob(env, 'run_a', ORG))
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop', jobId: job?.id }), env, 'run_a', ORG))

    // The runner restarts and, idle, asks for work again.
    assert.equal((await data<{ job: Job }>(await claimJob(env, 'run_a', ORG))).job, null)
    const row = db.prepare('SELECT status FROM jobs WHERE id = ?1').get(job?.id ?? '') as { status: string }
    assert.equal(row.status, 'abandoned')
    const run = db.prepare('SELECT outcome FROM runs WHERE id = ?1').get('r1') as { outcome: string }
    assert.equal(run.outcome, 'aborted')
  })
})

describe('runs', () => {
  test('a run cannot be attached to another tenant\'s job', async () => {
    const { env, db } = setup()
    db.prepare(`INSERT INTO jobs (id, org, project_slug, requested_by, created_at, status) VALUES ('job_other', 'org_other', 'x__y', 'u', ?1, 'claimed')`)
      .run(now())
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop', jobId: 'job_other', outcome: 'complete' }), env, 'run_a', ORG))
    const job = db.prepare(`SELECT status FROM jobs WHERE id = 'job_other'`).get() as { status: string }
    assert.equal(job.status, 'claimed')
  })

  test("a runner cannot overwrite another runner's run", async () => {
    const { env, db } = setup()
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop' }), env, 'run_a', ORG))
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop', outcome: 'complete', costUsd: 99 }), env, 'run_b', ORG))
    const run = db.prepare(`SELECT outcome, cost_usd FROM runs WHERE id = 'r1'`).get() as { outcome: string }
    assert.equal(run.outcome, 'running')
  })

  test('history older than the plan allows is not readable', async () => {
    const { env, db } = setup()
    await data(await recordRun(post({ runId: 'recent', projectSlug: 'acme__shop' }), env, 'run_a', ORG))
    await data(await recordRun(post({ runId: 'ancient', projectSlug: 'acme__shop' }), env, 'run_a', ORG))
    db.prepare(`UPDATE runs SET started_at = '2020-01-01T00:00:00.000Z' WHERE id = 'ancient'`).run()

    const { runs } = await data<{ runs: Array<{ id: string }> }>(await listRuns(env, ORG, new URL('https://x/api/runs')))
    assert.deepEqual(runs.map((r) => r.id), ['recent'])
    assert.equal((await getRun(env, ORG, 'ancient')).status, 404)
  })

  test("another org's run is not found", async () => {
    const { env } = setup()
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop' }), env, 'run_a', ORG))
    assert.equal((await getRun(env, 'org_other', 'r1')).status, 404)
  })

  test('the run view parses the agents summary', async () => {
    const { env } = setup()
    const agents = { build: { backend: 'claude-code', model: 'opus' } }
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop', agents }), env, 'run_a', ORG))
    const { run } = await data<{ run: { agents: unknown } }>(await getRun(env, ORG, 'r1'))
    assert.deepEqual(run.agents, agents)
  })
})

describe('configuration', () => {
  test('invalid settings are refused with the reasons', async () => {
    const { env } = setup()
    const res = await putSettings(post({ config: { budgetPerRunUsd: 'lots' } }), env, ORG, 'user')
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: { fields: string[] } }
    assert.equal(body.error.fields.length, 1)
  })

  test('changing org defaults tells every runner', async () => {
    const { env, sent } = setup()
    await data(await putSettings(post({ config: { verifyEvery: 3 } }), env, ORG, 'user'))
    const notified = sent.filter((s) => s.path === '/command').map((s) => s.runnerId).sort()
    assert.deepEqual(notified, ['run_a', 'run_b'])
  })

  test('a runner reads org defaults with its own overrides, plus the dashboard url', async () => {
    const { env } = setup()
    await putSettings(post({ config: { verifyEvery: 3, budgetPerRunUsd: 10 } }), env, ORG, 'user')
    await putRunnerConfig(post({ config: { verifyEvery: 7 } }), env, ORG, 'run_a')
    const got = await data<{ config: unknown; dashboardUrl: string }>(await runnerConfig(env, 'run_a', ORG))
    assert.deepEqual(got.config, { verifyEvery: 7, budgetPerRunUsd: 10 })
    assert.equal(got.dashboardUrl, 'https://app.example.test')
  })

  test('naming a project layers its config on top, as a claim would', async () => {
    const { env } = setup()
    await putSettings(post({ config: { verifyEvery: 3 } }), env, ORG, 'user')
    await putProjectConfig(post({ config: { verifyEvery: 9 } }), env, ORG, 'prj_acme__shop')
    const got = await data<{ config: unknown }>(await runnerConfig(env, 'run_a', ORG, 'acme__shop'))
    assert.deepEqual(got.config, { verifyEvery: 9 })
  })

  test("another org's project config cannot be written", async () => {
    const { env } = setup()
    const res = await putProjectConfig(post({ config: { verifyEvery: 2 } }), env, 'org_other', 'prj_acme__shop')
    assert.equal(res.status, 404)
  })

  test('only stop and run are relayed to a runner', async () => {
    const { env, sent } = setup()
    assert.equal((await commandRunner(post({ command: 'exec', script: 'x' }), env, ORG, 'run_a')).status, 400)
    await data(await commandRunner(post({ command: 'stop' }), env, ORG, 'run_a'))
    assert.deepEqual(sent.at(-1)?.body, { type: 'command', command: 'stop' })
  })
})

describe('installations', () => {
  test('a live installation is never moved to another org', async () => {
    const { env } = setup()
    assert.deepEqual(await upsertIntegration(env, 'org_first', '42'), { ok: true })
    const second = await upsertIntegration(env, 'org_second', '42')
    assert.equal(second.ok, false)
  })

  test('the same org reconnecting is fine', async () => {
    const { env } = setup()
    await upsertIntegration(env, 'org_first', '42')
    assert.deepEqual(await upsertIntegration(env, 'org_first', '42'), { ok: true })
  })
})
