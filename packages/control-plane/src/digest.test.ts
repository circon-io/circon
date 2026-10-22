import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeEnv, seedRunner, seedProject } from '../test/fakes.ts'
import { recordRun } from './fleet.ts'
import { digest, summarize } from './digest.ts'

const ORG = 'org_a'
const post = (body: unknown) => new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) })

async function data<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { ok: boolean; data: T; error?: unknown }
  assert.equal(body.ok, true, JSON.stringify(body.error))
  return body.data
}

const row = (over: Partial<Parameters<typeof summarize>[0][number]>) => ({
  project_slug: 'acme__shop', outcome: 'complete', cost_usd: 1, commit_subjects: null, pr_url: null, pr_state: null, ...over,
})

describe('daily digest', () => {
  test('says what was built, without the bookkeeping commits', () => {
    const { projects } = summarize([
      row({
        commit_subjects: JSON.stringify([
          'chore: screenshots for review', 'chore: record Checkout with Stripe', 'feat: Checkout with Stripe',
          'chore: sync prd', 'chore: iteration 3', 'fix(api): Reject expired sessions',
        ]),
      }),
    ])
    assert.deepEqual(projects[0]?.built, ['Checkout with Stripe', 'Reject expired sessions'])
  })

  test('groups by project, sums cost and outcomes, and caps the list', () => {
    const many = JSON.stringify(Array.from({ length: 11 }, (_, i) => `feat: Task ${i}`))
    const { projects, totals } = summarize([
      row({ commit_subjects: many, cost_usd: 1.234, pr_url: 'https://github.com/acme/shop/pull/1', pr_state: 'open' }),
      row({ outcome: 'stuck', cost_usd: 0.5 }),
      row({ project_slug: 'acme__blog', outcome: 'running', cost_usd: 0 }),
    ])
    const shop = projects.find((p) => p.slug === 'acme__shop')
    assert.equal(shop?.runs, 2)
    assert.deepEqual(shop?.outcomes, { complete: 1, stuck: 1 })
    assert.equal(shop?.costUsd, 1.73)
    assert.equal(shop?.built.length, 8)
    assert.equal(shop?.moreBuilt, 3)
    assert.equal(shop?.pullRequests.length, 1)
    assert.deepEqual(totals, { runs: 3, built: 11, costUsd: 1.73 })
  })

  test('a runner reports its commit subjects, and the digest reads them back', async () => {
    const { env, db } = fakeEnv()
    seedRunner(db, { id: 'run_a', org: ORG, lastSeenAt: new Date().toISOString() })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop' }), env, 'run_a', ORG))
    await data(await recordRun(post({ runId: 'r1', projectSlug: 'acme__shop', outcome: 'complete', commitSubjects: ['feat: Sign in', 42] }), env, 'run_a', ORG))
    const d = await data<{ projects: Array<{ slug: string; built: string[] }> }>(await digest(env, ORG, new URL('https://x/api/digest?hours=24')))
    assert.deepEqual(d.projects[0]?.built, ['Sign in'])
  })
})
