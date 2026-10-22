import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fakeEnv, seedProject, seedRunner } from '../../test/fakes.ts'
import { checkPrd, extractPrd, lineDiff } from './prd.ts'
import { streamPlan, approvePlan, editPlan, getPlan } from './routes.ts'
import type { PlannerClient } from './planner.ts'
// The runner's own parser: if the two ever disagree on what a task is, this fails.
import { readTasks } from '../../../cli/src/agent/progress.ts'

const ORG = 'org_a'

const GOOD_PRD = `# Shopping list

## Objective
A shared list.

## Scope
One household.

## Design Principles
- One screen.

## User Flows
1. Add an item [states: saving, failed]

## Task Backlog
- [ ] Add GET /items and POST /items with validation and tests
- [ ] Build the list screen with "New item" and "Add item" labels
- [ ] Add English and German strings for every visible text
`

describe('PRD checks', () => {
  test('a complete PRD passes and its tasks are what the runner will see', () => {
    const check = checkPrd(GOOD_PRD)
    assert.deepEqual(check.errors, [])
    const dir = mkdtempSync(join(tmpdir(), 'circon-prd-'))
    try {
      writeFileSync(join(dir, 'PRD.md'), GOOD_PRD)
      assert.deepEqual(readTasks(dir).map((t) => t.text), check.tasks)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an unfilled marker, missing sections or a thin backlog are named', () => {
    const check = checkPrd('# X\n\n## Objective\n<!-- CIRCON-UNFILLED -->\n\n## Task Backlog\n- [ ] one\n')
    assert.equal(check.ok, false)
    assert.ok(check.errors.some((e) => e.includes('UNFILLED')))
    assert.ok(check.errors.some((e) => e.includes('Design Principles')))
    assert.ok(check.errors.some((e) => e.includes('at least 3')))
  })

  test('duplicate tasks are refused, since they would complete together', () => {
    const check = checkPrd(GOOD_PRD.replace('Add English and German strings for every visible text', 'Build the list screen with "New item" and "Add item" labels'))
    assert.ok(check.errors.includes('has duplicate tasks'))
  })

  test('proposed additions are not tasks, and may not be written as tasks', () => {
    const proposed = `${GOOD_PRD}\n## Proposed additions\n1. Undo after deleting an item — a mistap should not lose data\n`
    const check = checkPrd(proposed)
    assert.deepEqual(check.errors, [])
    assert.equal(check.tasks.length, 3)

    // Refused, and not counted either way: the runner would skip it.
    const asTask = `${GOOD_PRD}\n## Proposed additions\n- [ ] Undo after deleting an item\n`
    const refused = checkPrd(asTask)
    assert.ok(refused.errors.some((e) => e.includes('Proposed additions')))
    const dir = mkdtempSync(join(tmpdir(), 'circon-prd-'))
    try {
      writeFileSync(join(dir, 'PRD.md'), asTask)
      assert.deepEqual(readTasks(dir).map((t) => t.text), refused.tasks)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a fenced answer is unwrapped', () => {
    assert.equal(extractPrd('```markdown\n# A\n```'), '# A\n')
  })

  test('the diff shows what a refinement changed', () => {
    const diff = lineDiff('a\nb\nc', 'a\nB\nc\nd')
    assert.deepEqual(diff.filter((d) => d.op !== ' '), [
      { op: '-', line: 'b' },
      { op: '+', line: 'B' },
      { op: '+', line: 'd' },
    ])
  })
})

/** A stand-in for the SDK's streaming call: yields the text, then the final message. */
function fakeClient(answer: { text: string; stop?: string }) {
  const calls: unknown[] = []
  const client = {
    beta: {
      messages: {
        stream: (params: unknown) => {
          calls.push(params)
          const chunks = answer.text.match(/[\s\S]{1,40}/g) ?? []
          return {
            async *[Symbol.asyncIterator]() {
              for (const text of chunks) yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
            },
            finalMessage: async () => ({
              model: 'claude-fable-5-1',
              stop_reason: answer.stop ?? 'end_turn',
              content: [{ type: 'text', text: answer.text }],
              usage: { input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
            }),
          }
        },
      },
    },
  }
  return { client: client as unknown as PlannerClient, calls }
}

const conventionsFetch = (async (url: RequestInfo | URL) =>
  new Response(String(url).endsWith('ARCHITECTURE.md') ? '# Engineering Conventions' : '# PRD template')) as typeof fetch

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

async function events(response: Response): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const text = await response.text()
  return text.split('\n\n').filter(Boolean).map((block) => {
    const event = /^event: (.+)$/m.exec(block)?.[1] ?? ''
    const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? '{}') as Record<string, unknown>
    return { event, data }
  })
}

const post = (body: unknown) => new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) })

describe('generating a plan', () => {
  test('streams the PRD, saves it as version 1 and counts one generation', async () => {
    const { env, db } = fakeEnv({ ANTHROPIC_API_KEY: 'k' })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    const { client, calls } = fakeClient({ text: GOOD_PRD })

    const res = await streamPlan(post({ idea: 'A shared shopping list' }), env, ctx, ORG, 'user_1', 'prj_acme__shop', {
      client, fetchImpl: conventionsFetch,
    })
    const got = await events(res)
    assert.ok(got.some((e) => e.event === 'delta'))
    const done = got.find((e) => e.event === 'done')
    assert.equal(done?.data['version'], 1)

    const usage = db.prepare('SELECT generations, output_tokens FROM ai_usage WHERE org = ?1').get(ORG) as { generations: number }
    assert.equal(usage.generations, 1)

    // The cached system prompt carries the conventions; fallback is opted into.
    const params = calls[0] as { system: Array<{ text: string; cache_control?: unknown }>; fallbacks?: unknown; model: string }
    assert.match(params.system[0]?.text ?? '', /# Engineering Conventions/)
    assert.deepEqual(params.system[0]?.cache_control, { type: 'ephemeral' })
    assert.equal(params.fallbacks, 'default')
    assert.equal(params.model, 'claude-fable-5-1')
  })

  test('a refinement builds on the latest version', async () => {
    const { env, db } = fakeEnv({ ANTHROPIC_API_KEY: 'k' })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    await editPlan(post({ prd: GOOD_PRD }), env, ORG, 'user_1', 'prj_acme__shop')
    const { client, calls } = fakeClient({ text: GOOD_PRD.replace('One screen.', 'Two screens.') })

    const got = await events(await streamPlan(post({ instruction: 'Allow two screens' }), env, ctx, ORG, 'u', 'prj_acme__shop', {
      client, fetchImpl: conventionsFetch,
    }))
    assert.equal(got.find((e) => e.event === 'done')?.data['version'], 2)
    const sent = JSON.stringify((calls[0] as { messages: unknown }).messages)
    assert.match(sent, /current_prd/)
    assert.match(sent, /Allow two screens/)

    const detail = (await (await getPlan(env, ORG, 'prj_acme__shop', 2)).json()) as { data: { diff: Array<{ op: string; line: string }> } }
    assert.ok(detail.data.diff.some((d) => d.op === '+' && d.line.includes('Two screens')))
  })

  test('a refusal reports an error and costs no allowance', async () => {
    const { env, db } = fakeEnv({ ANTHROPIC_API_KEY: 'k' })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    const { client } = fakeClient({ text: '', stop: 'refusal' })
    const got = await events(await streamPlan(post({ idea: 'x' }), env, ctx, ORG, 'u', 'prj_acme__shop', { client, fetchImpl: conventionsFetch }))
    assert.equal(got.at(-1)?.event, 'error')
    assert.equal(got.at(-1)?.data['code'], 'refused')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_usage').get()?.['n'], 0)
  })

  test('the monthly allowance is enforced before anything is spent', async () => {
    const { env, db } = fakeEnv({ ANTHROPIC_API_KEY: 'k' })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    db.prepare(`INSERT INTO ai_usage (org, month, generations) VALUES (?1, ?2, 10)`).run(ORG, new Date().toISOString().slice(0, 7))
    const { client, calls } = fakeClient({ text: GOOD_PRD })
    const res = await streamPlan(post({ idea: 'x' }), env, ctx, ORG, 'u', 'prj_acme__shop', { client, fetchImpl: conventionsFetch })
    assert.equal(res.status, 402)
    assert.equal(calls.length, 0)
  })

  test("another org's project cannot be planned", async () => {
    const { env, db } = fakeEnv({ ANTHROPIC_API_KEY: 'k' })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    const { client } = fakeClient({ text: GOOD_PRD })
    const res = await streamPlan(post({ idea: 'x' }), env, ctx, 'org_other', 'u', 'prj_acme__shop', { client, fetchImpl: conventionsFetch })
    assert.equal(res.status, 404)
  })
})

describe('approving a plan', () => {
  let realFetch: typeof fetch
  let pem = ''
  beforeEach(async () => {
    realFetch = globalThis.fetch
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )
    const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')
    pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  function github(opts: { protectedBranch: boolean }) {
    const seen: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      seen.push(`${method} ${url.replace('https://api.github.com', '')}`)
      if (url.endsWith('/access_tokens')) return Response.json({ token: 't', expires_at: '2099-01-01T00:00:00Z' })
      if (method === 'GET' && url.includes('/contents/PRD.md')) return new Response('', { status: 404 })
      if (method === 'PUT' && url.includes('/contents/PRD.md')) {
        const body = JSON.parse(String(init?.body)) as { branch: string; content: string }
        if (opts.protectedBranch && body.branch === 'main') return new Response('protected', { status: 409 })
        assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), GOOD_PRD)
        return Response.json({ commit: { sha: 'abc123' } })
      }
      if (url.includes('/git/ref/heads/main')) return Response.json({ object: { sha: 'base' } })
      if (url.endsWith('/git/refs')) return Response.json({}, { status: 201 })
      if (url.endsWith('/pulls')) return Response.json({ html_url: 'https://github.com/acme/shop/pull/7' })
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch
    return seen
  }

  async function setup() {
    const ctxEnv = fakeEnv({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: pem })
    seedProject(ctxEnv.db, { org: ORG, slug: 'acme__shop' })
    await editPlan(post({ prd: GOOD_PRD }), ctxEnv.env, ORG, 'u', 'prj_acme__shop')
    return ctxEnv
  }

  test('commits PRD.md to the default branch and tells runners', async () => {
    const { env, db, sent } = await setup()
    seedRunner(db, { id: 'run_a', org: ORG })
    github({ protectedBranch: false })
    const res = await approvePlan(env, ORG, 'u', 'prj_acme__shop', 1)
    const body = (await res.json()) as { data: { kind: string; sha: string } }
    assert.equal(body.data.kind, 'committed')
    const row = db.prepare(`SELECT status, commit_sha FROM plans WHERE version = 1`).get() as { status: string; commit_sha: string }
    assert.deepEqual({ ...row }, { status: 'approved', commit_sha: 'abc123' })
    assert.ok(sent.some((s) => JSON.stringify(s.body) === JSON.stringify({ type: 'prd-changed', project: 'acme__shop' })))
  })

  test('a protected branch gets a pull request instead, and runners wait for the merge', async () => {
    const { env, db, sent } = await setup()
    const seen = github({ protectedBranch: true })
    const res = await approvePlan(env, ORG, 'u', 'prj_acme__shop', 1)
    const body = (await res.json()) as { data: { kind: string; url: string } }
    assert.equal(body.data.kind, 'pull-request')
    assert.ok(seen.some((s) => s.startsWith('POST') && s.endsWith('/git/refs')))
    const row = db.prepare(`SELECT pr_url FROM plans WHERE version = 1`).get() as { pr_url: string }
    assert.equal(row.pr_url, 'https://github.com/acme/shop/pull/7')
    assert.equal(sent.filter((s) => s.path === '/command').length, 0)
  })

  test('an invalid plan is never written to the repository', async () => {
    const { env, db } = fakeEnv({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: pem })
    const seen = github({ protectedBranch: false })
    seedProject(db, { org: ORG, slug: 'acme__shop' })
    await editPlan(post({ prd: '# Nothing here\n' }), env, ORG, 'u', 'prj_acme__shop')
    const res = await approvePlan(env, ORG, 'u', 'prj_acme__shop', 1)
    assert.equal(res.status, 400)
    assert.equal(seen.length, 0)
  })
})
