/**
 * Sample data for preview mode (`NEXT_PUBLIC_PREVIEW=1 next dev`).
 *
 * A small in-memory control plane: reads return fixtures, and the writes the
 * interface makes (saving settings, answering a request, approving a plan)
 * change them, so the screens can be clicked through. Never part of a
 * production build — see PREVIEW in lib/auth.tsx.
 */

const now = Date.now()
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

const PLAN = `# Shopping list

## Objective
A shared shopping list a household keeps in sync from their phones.

## Scope
One household per list. Out of scope for now: recipes, price tracking.

## Design Principles
- **One screen.** Everything happens on the list; no navigation to get lost in.
- **Instant.** Adding an item never waits on the network.
- **Errors stay inline.** A failed sync shows on the item, never as a modal.

## User Flows
1. Open the app → the list   [states: loading, empty, offline]
2. Type an item, press Add  [states: saving, failed]
3. Check it off in the store

## Task Backlog
- [ ] Items API: GET and POST /items with validation and tests
- [ ] List screen with "New item" and "Add item"
- [ ] Check items off, with an undo
- [ ] Share the list with a household member by invite link
- [ ] English and German strings for every visible text
`

const db = {
  overview: {
    runsLast7d: 23,
    running: 1,
    successRate7d: 0.83,
    spentLast24h: 4.12,
    spentLast30d: 61.4,
    pendingRequests: 2,
    plansAwaitingApproval: 1,
  },
  runners: [
    {
      id: 'run_studio', name: 'studio-rtx', platform: 'linux studio', cli_version: '0.3.0', conventions_ref: 'v2.0.0',
      config: { iosRunnerMode: 'device' }, created_at: ago(60 * 24 * 30), last_seen_at: ago(0),
      state: {
        status: 'running', project: 'acme__shop', branch: 'circon/run-2026-10-22-a1b2c3', runId: 'run_live01', iteration: 7, costUsd: 1.84, lastSeenAt: ago(0),
        health: { diskFreeGb: 412.3, diskTotalGb: 915.3, loadPerCore: 0.62, gpu: { name: 'NVIDIA GeForce RTX 3060', utilization: 71, memoryUsedMb: 9120, memoryTotalMb: 12288, temperatureC: 68 }, ollama: true, checkedAt: ago(4) },
      },
    },
    {
      id: 'run_mini', name: 'mac-mini', platform: 'darwin mac-mini', cli_version: '0.3.0', conventions_ref: 'v2.0.0',
      config: { iosRunnerMode: 'simulator' }, created_at: ago(60 * 24 * 9), last_seen_at: ago(1),
      state: {
        status: 'idle', lastSeenAt: ago(1),
        health: { diskFreeGb: 14.2, diskTotalGb: 228.3, loadPerCore: 0.08, gpu: null, ollama: true, checkedAt: ago(7) },
      },
    },
    {
      id: 'run_old', name: 'old-thinkpad', platform: 'linux thinkpad', cli_version: '0.2.0', conventions_ref: 'v1.0.0',
      config: {}, created_at: ago(60 * 24 * 60), last_seen_at: ago(60 * 26),
      state: { status: 'offline', lastSeenAt: ago(60 * 26) },
    },
  ],
  projects: [
    { id: 'prj_shop', slug: 'acme__shop', status: 'active', default_branch: 'main', account_login: 'acme', integration_revoked: null, latest_plan: 3, approved_plan: 3 },
    { id: 'prj_book', slug: 'acme__bookings', status: 'active', default_branch: 'main', account_login: 'acme', integration_revoked: null, latest_plan: 1, approved_plan: null },
    { id: 'prj_portal', slug: 'acme__partner-portal', status: 'active', default_branch: 'main', account_login: 'acme', integration_revoked: null, latest_plan: null, approved_plan: null },
  ],
  integrations: [{ id: 'itg_1', provider: 'github', account_login: 'acme', account_type: 'Organization', created_at: ago(60 * 24 * 30), revoked_at: null }],
  runs: [
    { id: 'run_live01', runner_id: 'run_studio', job_id: 'job_1', project_slug: 'acme__shop', branch: 'circon/run-2026-10-22-a1b2c3', started_at: ago(48), finished_at: null, outcome: 'running', iterations: 6, commits: 5, cost_usd: 1.84, pr_url: null, pr_state: null, failed_tier: null, gate_tiers: ['typecheck', 'unit tests', 'web UI', 'android UI'], commit_subjects: ['chore: record Undo a check-off for five seconds', 'feat: Undo a check-off for five seconds', 'feat: Empty state for a new list', 'chore: sync prd', 'feat: Check off an item, synced to every phone'] },
    { id: 'run_02', runner_id: 'run_mini', job_id: 'job_2', project_slug: 'acme__shop', branch: 'circon/run-2026-10-21-d4e5f6', started_at: ago(60 * 20), finished_at: ago(60 * 18), outcome: 'complete', iterations: 9, commits: 9, cost_usd: 2.31, pr_url: 'https://github.com/acme/shop/pull/42', pr_state: 'merged', failed_tier: null, gate_tiers: ['typecheck', 'unit tests', 'web UI', 'android UI', 'ios UI'], commit_subjects: ['chore: screenshots for review', 'feat: Share the list with a household member by invite link', 'feat: Sign in with email', 'feat: Create a list and add items'] },
    { id: 'run_03', runner_id: 'run_studio', job_id: 'job_3', project_slug: 'acme__bookings', branch: 'circon/run-2026-10-21-0a9b8c', started_at: ago(60 * 26), finished_at: ago(60 * 25), outcome: 'stuck', iterations: 4, commits: 1, cost_usd: 0.92, pr_url: 'https://github.com/acme/bookings/pull/7', pr_state: 'open', failed_tier: 'web UI', gate_tiers: ['typecheck', 'unit tests', 'web UI'] },
    { id: 'run_04', runner_id: 'run_studio', job_id: 'job_4', project_slug: 'acme__shop', branch: 'circon/run-2026-10-20-77aa11', started_at: ago(60 * 46), finished_at: ago(60 * 44), outcome: 'complete', iterations: 12, commits: 11, cost_usd: 3.05, pr_url: 'https://github.com/acme/shop/pull/39', pr_state: 'merged', failed_tier: null, gate_tiers: ['typecheck', 'unit tests', 'web UI', 'android UI'] },
    { id: 'run_05', runner_id: 'run_mini', job_id: 'job_5', project_slug: 'acme__shop', branch: 'circon/run-2026-10-19-5e5e5e', started_at: ago(60 * 70), finished_at: ago(60 * 69), outcome: 'usage-limit', iterations: 3, commits: 2, cost_usd: 0, pr_url: 'https://github.com/acme/shop/pull/37', pr_state: 'closed', failed_tier: null, gate_tiers: ['typecheck', 'unit tests'] },
    { id: 'run_06', runner_id: 'run_old', job_id: 'job_6', project_slug: 'acme__bookings', branch: 'circon/run-2026-10-18-c0ffee', started_at: ago(60 * 94), finished_at: ago(60 * 93), outcome: 'infrastructure', iterations: 0, commits: 0, cost_usd: 0.04, pr_url: null, pr_state: null, failed_tier: null, gate_tiers: [] },
  ] as Array<Record<string, unknown>>,
  requests: [
    { id: 'req_1', name: 'STRIPE_SECRET_KEY', reason: 'Checkout creates payment intents with the Stripe API', status: 'pending', run_id: 'run_live01', created_at: ago(12), resolved_at: null, project_id: 'prj_shop', project_slug: 'acme__shop' },
    { id: 'req_2', name: 'GOOGLE_MAPS_API_KEY', reason: 'The store locator geocodes addresses', status: 'pending', run_id: 'run_03', created_at: ago(60 * 25), resolved_at: null, project_id: 'prj_book', project_slug: 'acme__bookings' },
    { id: 'req_3', name: 'RESEND_API_KEY', reason: 'Invite emails for shared lists', status: 'fulfilled', run_id: 'run_04', created_at: ago(60 * 45), resolved_at: ago(60 * 44), project_id: 'prj_shop', project_slug: 'acme__shop' },
  ] as Array<Record<string, unknown>>,
  settings: {
    budgetPerRunUsd: 10,
    budgetPerDayUsd: 40,
    agents: { plan: { backend: 'claude-code', model: 'fable' }, build: { backend: 'claude-code', model: 'opus' }, review: { backend: 'codex' } },
  } as Record<string, unknown>,
  projectConfig: { prj_shop: { skipTiers: [] }, prj_book: { skipTiers: ['ios UI'] }, prj_portal: {} } as Record<string, Record<string, unknown>>,
  plans: {
    prj_shop: [
      { id: 'pln_3', version: 3, status: 'approved', source: 'refined', prompt: 'Add sharing by invite link', model: 'claude-fable-5-1', created_at: ago(60 * 50), approved_at: ago(60 * 49), commit_sha: 'a1b2c3d', pr_url: null, prd: PLAN },
      { id: 'pln_2', version: 2, status: 'superseded', source: 'edited', prompt: null, model: null, created_at: ago(60 * 70), approved_at: null, commit_sha: null, pr_url: null, prd: PLAN.replace('- [ ] Share the list with a household member by invite link\n', '') },
      { id: 'pln_1', version: 1, status: 'superseded', source: 'generated', prompt: 'A shared shopping list for a household, synced across phones.', model: 'claude-fable-5-1', created_at: ago(60 * 72), approved_at: null, commit_sha: null, pr_url: null, prd: PLAN.replace('- [ ] Check items off, with an undo\n', '') },
    ],
    prj_book: [
      { id: 'pln_b1', version: 1, status: 'draft', source: 'generated', prompt: 'Online bookings for a small physiotherapy practice.', model: 'claude-fable-5-1', created_at: ago(60 * 3), approved_at: null, commit_sha: null, pr_url: null, prd: PLAN.replace('Shopping list', 'Bookings') },
    ],
    prj_portal: [],
  } as Record<string, Array<Record<string, unknown> & { version: number; prd: string }>>,
  secrets: {
    machine: [{ id: 'sec_1', name: 'ANTHROPIC_API_KEY', updated_at: ago(60 * 24 * 3), updated_by: 'user_1' }],
    prj_shop: [
      { id: 'sec_2', name: 'CLOUDFLARE_API_TOKEN', updated_at: ago(60 * 24 * 10), updated_by: 'user_1' },
      { id: 'sec_3', name: 'RESEND_API_KEY', updated_at: ago(60 * 44), updated_by: 'user_1' },
    ],
  } as Record<string, Array<Record<string, unknown>>>,
}

function checkPrd(prd: string) {
  const tasks = prd.split('\n').flatMap((l) => {
    const m = /^[-*]\s+\[[ xX]\]\s+(.+)$/.exec(l.trim())
    return m?.[1] ? [m[1]] : []
  })
  return { ok: tasks.length >= 3, errors: tasks.length >= 3 ? [] : ['has too few tasks'], tasks }
}

const LOG_LINES = [
  '── Iteration 7/20',
  '→ Planning with claude-code…',
  'Plan: add invite tokens to the lists table, a POST /lists/:id/invites route, and the share sheet.',
  '→ Building with claude-code (opus)…',
  'Edited services/api/src/db/schema.ts',
  'Edited services/api/src/app.ts',
  'Edited apps/mobile/app/share.tsx',
  '→ Running the quality gate…',
  '✓ typecheck',
  '✓ unit tests — 41 passed',
  '✓ web UI — 12 labels present',
  '… android UI',
]

export async function previewFetch(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  await new Promise((r) => setTimeout(r, 120))
  const method = (init.method ?? 'GET').toUpperCase()
  const url = new URL(path, 'https://preview.local')
  const p = url.pathname
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
  const okBody = (data: unknown) => ({ status: 200, body: { ok: true, data } })
  const seg = p.split('/')

  if (p === '/api/overview') return okBody(db.overview)
  if (p === '/api/digest') {
    const since = Date.now() - 24 * 3_600_000
    const recent = db.runs.filter((r) => Date.parse(String(r['started_at'])) >= since || Date.parse(String(r['finished_at'] ?? 0)) >= since)
    const projects = [...new Set(recent.map((r) => String(r['project_slug'])))].map((slug) => {
      const runs = recent.filter((r) => r['project_slug'] === slug)
      const built = [...new Set(runs.flatMap((r) => (r['commit_subjects'] as string[] | undefined) ?? []).filter((s) => !s.startsWith('chore:')).map((s) => s.replace(/^feat: /, '')))]
      return {
        slug,
        runs: runs.length,
        outcomes: Object.fromEntries(runs.map((r) => [String(r['outcome']), 1])),
        costUsd: runs.reduce((n, r) => n + Number(r['cost_usd']), 0),
        built,
        moreBuilt: 0,
        pullRequests: runs.filter((r) => r['pr_url']).map((r) => ({ url: String(r['pr_url']), state: r['pr_state'] as string | null })),
      }
    })
    return okBody({
      since: new Date(since).toISOString(),
      hours: 24,
      projects,
      totals: { runs: recent.length, built: projects.reduce((n, x) => n + x.built.length, 0), costUsd: projects.reduce((n, x) => n + x.costUsd, 0) },
    })
  }
  if (p === '/api/runners') return okBody({ runners: db.runners })
  if (p === '/api/runs') {
    const project = url.searchParams.get('project')
    return okBody({ runs: db.runs.filter((r) => !project || r['project_slug'] === project), spentLast24h: db.overview.spentLast24h })
  }
  if (/^\/api\/runs\/[^/]+$/.test(p)) {
    const run = db.runs.find((r) => r['id'] === seg[3])
    if (!run) return { status: 404, body: { ok: false, error: { code: 'not_found', message: 'No such run.' } } }
    const runner = db.runners.find((r) => r.id === run['runner_id'])
    return okBody({
      run: { ...run, runner_name: runner?.name ?? null, agents: { plan: { backend: 'claude-code', model: 'fable' }, build: { backend: 'claude-code', model: 'opus' }, review: { backend: 'codex' } } },
      live: run['outcome'] === 'running' ? runner?.state : null,
    })
  }
  if (p === '/api/projects') return okBody({ projects: db.projects })
  if (p === '/api/integrations') return okBody({ integrations: db.integrations })
  if (/^\/api\/integrations\/[^/]+\/repos$/.test(p)) {
    return okBody({ repositories: [
      { id: '1', fullName: 'acme/shop', defaultBranch: 'main', private: true, connected: true },
      { id: '2', fullName: 'acme/bookings', defaultBranch: 'main', private: true, connected: true },
      { id: '3', fullName: 'acme/marketing-site', defaultBranch: 'main', private: false, connected: false },
    ] })
  }
  if (p === '/api/requests') {
    const status = url.searchParams.get('status')
    return okBody({ requests: db.requests.filter((r) => !status || r['status'] === status) })
  }
  if (/^\/api\/requests\/[^/]+\/(fulfill|dismiss)$/.test(p)) {
    const r = db.requests.find((x) => x['id'] === seg[3])
    if (r) {
      r['status'] = seg[4] === 'fulfill' ? 'fulfilled' : 'dismissed'
      r['resolved_at'] = new Date().toISOString()
      db.overview.pendingRequests = db.requests.filter((x) => x['status'] === 'pending').length
    }
    return okBody({ done: true })
  }
  if (p === '/api/settings') {
    if (method === 'POST') db.settings = (body['config'] as Record<string, unknown>) ?? {}
    return okBody({ config: db.settings, inherited: {} })
  }
  if (/^\/api\/projects\/[^/]+\/env-checklist$/.test(p)) {
    const stored = new Set([...(db.secrets['machine'] ?? []), ...(db.secrets[seg[3] ?? ''] ?? [])].map((x) => String(x['name'])))
    const raw: Array<[string, string, string | null, boolean, 'env-example' | 'plan']> = seg[3] === 'prj_portal' ? [] : [
      ['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', 'The app: Clerk dashboard → API Keys → Publishable key', 'Clerk (auth)', false, 'env-example'],
      ['CLERK_JWKS_URL', 'The API verifies session tokens against these (Clerk → API Keys → JWKS URL)', 'Clerk (auth)', false, 'env-example'],
      ['CLERK_WEBHOOK_SECRET', 'Clerk → Webhooks → your endpoint → Signing secret (whsec_…)', 'Clerk (auth)', false, 'env-example'],
      ['EXPO_PUBLIC_API_URL', '', 'The API', true, 'env-example'],
      ['CLOUDFLARE_ACCOUNT_ID', '', 'Cloudflare (deploys)', false, 'env-example'],
      ['CLOUDFLARE_API_TOKEN', '', 'Cloudflare (deploys)', false, 'env-example'],
      ['STRIPE_SECRET_KEY', 'Checkout and subscriptions; Stripe → Developers → API keys', 'From the plan', false, 'plan'],
    ]
    const items = raw.map(([name, help, group, hasDefault, source]) => ({
      name, help, group, source,
      status: stored.has(name) ? 'set' : hasDefault ? 'default' : 'missing',
    }))
    return okBody({ items, foundEnvExample: seg[3] !== 'prj_portal', readError: null, missing: items.filter((i) => i.status === 'missing').length })
  }
  if (/^\/api\/runners\/[^/]+\/config$/.test(p)) {
    const runner = db.runners.find((r) => r.id === seg[3])
    if (runner && method === 'POST') runner.config = (body['config'] as typeof runner.config) ?? {}
    return okBody({ config: runner?.config ?? {}, inherited: db.settings })
  }
  if (/^\/api\/projects\/[^/]+\/config$/.test(p)) {
    if (method === 'POST') db.projectConfig[seg[3] ?? ''] = (body['config'] as Record<string, unknown>) ?? {}
    return okBody({ config: db.projectConfig[seg[3] ?? ''] ?? {}, inherited: db.settings })
  }
  if (/^\/api\/projects\/[^/]+\/plans$/.test(p)) {
    const plans = db.plans[seg[3] ?? ''] ?? []
    if (method === 'POST') {
      const version = (plans[0]?.version ?? 0) + 1
      const prd = String(body['prd'] ?? '')
      plans.unshift({ id: `pln_${version}`, version, status: 'draft', source: 'edited', prompt: null, model: null, created_at: new Date().toISOString(), approved_at: null, commit_sha: null, pr_url: null, prd })
      return okBody({ version, check: checkPrd(prd) })
    }
    return okBody({
      plans: plans.map((plan) => {
        const summary: Record<string, unknown> = { ...plan }
        delete summary['prd']
        return summary
      }),
    })
  }
  if (/^\/api\/projects\/[^/]+\/plans\/\d+$/.test(p)) {
    const plans = db.plans[seg[3] ?? ''] ?? []
    const plan = plans.find((x) => x.version === Number(seg[5]))
    const previous = plans.find((x) => x.version === Number(seg[5]) - 1)
    if (!plan) return { status: 404, body: { ok: false, error: { code: 'not_found', message: 'No such plan.' } } }
    const diff = previous ? simpleDiff(previous.prd, plan.prd) : null
    return okBody({ plan, check: checkPrd(plan.prd), diff })
  }
  if (/^\/api\/projects\/[^/]+\/plans\/\d+\/approve$/.test(p)) {
    const plans = db.plans[seg[3] ?? ''] ?? []
    for (const x of plans) if (x['status'] === 'approved') x['status'] = 'superseded'
    const plan = plans.find((x) => x.version === Number(seg[5]))
    if (plan) plan['status'] = 'approved'
    const project = db.projects.find((x) => x.id === seg[3])
    if (project) project.approved_plan = Number(seg[5])
    return okBody({ kind: 'committed', sha: 'f00ba44' })
  }
  if (/^\/api\/projects\/[^/]+\/release$/.test(p)) {
    return okBody({
      pending: { number: 44, url: 'https://github.com/acme/shop/pull/44', title: 'chore: version packages', body: '## @app/mobile 1.4.0\n\n### Minor changes\n\n- Share a list with your household by invite link\n- Check items off with an undo\n\n### Patch changes\n\n- The list no longer flickers while syncing' },
      lastRelease: { approved_at: ago(60 * 24 * 6), pr_url: 'https://github.com/acme/shop/pull/31', title: 'chore: version packages' },
      runs: db.runs.filter((r) => r['pr_state'] === 'merged').map((r) => ({ ...r, screenshots: [] })),
      costUsd: 5.36,
      devBuild: { status: 'finished', startedAt: ago(60 * 5), artifacts: [{ name: 'shop-dev-client.ipa', url: 'https://example.com/shop.ipa' }] },
    })
  }
  if (p === '/api/secrets') {
    if (method === 'POST') {
      const key = body['scope'] === 'machine' ? 'machine' : String(body['projectId'])
      ;(db.secrets[key] ??= []).push({ id: `sec_${Math.random()}`, name: body['name'], updated_at: new Date().toISOString(), updated_by: 'you' })
      // As the control plane does: storing a name answers the requests for it.
      for (const r of db.requests) {
        if (r['name'] === body['name'] && r['status'] === 'pending' && (key === 'machine' || r['project_id'] === key)) r['status'] = 'fulfilled'
      }
      db.overview.pendingRequests = db.requests.filter((x) => x['status'] === 'pending').length
      return okBody({ name: body['name'] })
    }
    const key = url.searchParams.get('scope') === 'project' ? (url.searchParams.get('projectId') ?? '') : 'machine'
    return okBody({ secrets: db.secrets[key] ?? [] })
  }
  if (p === '/api/billing') {
    return okBody({
      plan: { id: 'pro', name: 'Pro', priceLabel: '$49 / month' }, status: 'active',
      limits: { runners: 10, projects: 10, integrations: 3, queuedJobs: 50, runHistoryDays: 90, planGenerations: 100 },
      usage: { runners: 3 }, hasSubscription: true,
      plans: [
        { id: 'basic', name: 'Basic', priceLabel: 'Free', limits: { runners: 1 } },
        { id: 'pro', name: 'Pro', priceLabel: '$49 / month', limits: { runners: 10 } },
      ],
    })
  }
  if (p === '/api/enroll-token') return okBody({ token: 'a1b2c3d4e5f6a7b8c9d0e1f2', expiresAt: ago(-30), ttlMinutes: 30 })
  if (p === '/api/jobs') return okBody({ jobId: 'job_new' })
  if (/^\/api\/runners\/[^/]+\/command$/.test(p)) return okBody({ delivered: 1 })
  if (/^\/api\/runners\/[^/]+\/logs$/.test(p)) return { status: 200, body: { lines: LOG_LINES } }
  return okBody({})
}

function simpleDiff(before: string, after: string) {
  const a = new Set(before.split('\n'))
  const b = new Set(after.split('\n'))
  return [
    ...after.split('\n').map((line) => ({ op: (a.has(line) ? ' ' : '+') as ' ' | '+', line })),
    ...before.split('\n').filter((line) => !b.has(line)).map((line) => ({ op: '-' as const, line })),
  ]
}

/** A generation, streamed a few characters at a time like the real planner. */
export async function previewStream(onEvent: (event: string, data: Record<string, unknown>) => void) {
  for (const chunk of PLAN.match(/[\s\S]{1,24}/g) ?? []) {
    await new Promise((r) => setTimeout(r, 15))
    onEvent('delta', { text: chunk })
  }
  onEvent('done', { version: 2, check: checkPrd(PLAN) })
}

/** Live output, as if a runner were working. */
export function previewLogLines(): string[] {
  return LOG_LINES
}
