import { type Env, fail, ok, json, id, nowIso } from './env.ts'
import {
  authenticateHuman, authenticateRunner, hashToken, newToken, unauthorized, forbidden,
} from './auth.ts'
import { RunnerDO } from './runner-do.ts'
import { canEnrollRunner, canQueueJob, entitlementFor, countRunners } from './billing/entitlements.ts'
import { createCheckout, createPortal, handleWebhook } from './billing/stripe.ts'
import { publicPlans, isPlanId } from './billing/plans.ts'

export { RunnerDO }

/**
 * The control plane.
 *
 * Deliberately a *view plus a job dispatcher*: conventions and PRDs live in
 * GitHub, so this never becomes a file server with its own conflict
 * resolution. What it does own is fleet state, queued work, per-runner config
 * and run history.
 */

function runnerStub(env: Env, runnerId: string) {
  return env.RUNNER.get(env.RUNNER.idFromName(runnerId))
}

/**
 * The dashboard is a separate Worker, so browser calls are cross-origin. Only
 * the configured dashboard origin is allowed; runners authenticate with bearer
 * tokens and are not subject to CORS at all.
 */
function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!origin || !env.DASHBOARD_ORIGIN || origin !== env.DASHBOARD_ORIGIN) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(env, request)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    const response = await handle(request, env, ctx)
    // A 101 upgrade must be returned untouched or the socket never opens.
    if (response.status === 101) return response
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value)
    return response
  },
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // ---- runner endpoints -------------------------------------------------

      // Enrollment is the one unauthenticated route: the one-time token *is*
      // the credential, and it is consumed here.
      if (path === '/api/enroll' && request.method === 'POST') {
        return await enroll(request, env)
      }

      // Stripe cannot present a Clerk session, so the signature is the
      // authentication. Verified inside handleWebhook before anything is read.
      if (path === '/api/webhooks/stripe' && request.method === 'POST') {
        return await handleWebhook(request, env)
      }

      if (path === '/api/runner/socket') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized('Runner token rejected')
        const stub = runnerStub(env, principal.id)
        return stub.fetch(new Request(`https://do/socket?role=runner`, request))
      }

      if (path === '/api/runner/config' && request.method === 'GET') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        return await runnerConfig(env, principal.id)
      }

      if (path === '/api/runner/claim' && request.method === 'POST') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        return await claimJob(env, principal.id, principal.org)
      }

      if (path === '/api/runner/run' && request.method === 'POST') {
        const principal = await authenticateRunner(request, env)
        if (!principal) return unauthorized()
        return await recordRun(request, env, principal.id)
      }

      // ---- dashboard endpoints ---------------------------------------------

      if (path.startsWith('/api/')) {
        const principal = await authenticateHuman(request, env)
        if (!principal) return unauthorized('Sign in to continue')

        if (path === '/api/runners' && request.method === 'GET') {
          return await listRunners(env, principal.org)
        }
        if (path === '/api/enroll-token' && request.method === 'POST') {
          return await createEnrollToken(request, env, principal.org, principal.id)
        }
        if (path === '/api/runs' && request.method === 'GET') {
          return await listRuns(env, principal.org, url)
        }
        if (path === '/api/jobs' && request.method === 'POST') {
          return await queueJob(request, env, principal.org, principal.id)
        }
        if (path === '/api/billing' && request.method === 'GET') {
          return await billingSummary(env, principal.org)
        }
        if (path === '/api/billing/checkout' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as {
            plan?: string
            returnTo?: string
          }
          if (!isPlanId(body.plan)) return fail('invalid_input', 'Unknown plan.')
          return await createCheckout(
            env,
            principal.org,
            principal.email,
            body.plan,
            body.returnTo ?? env.DASHBOARD_ORIGIN ?? '',
          )
        }
        if (path === '/api/billing/portal' && request.method === 'POST') {
          const body = (await request.json().catch(() => ({}))) as { returnTo?: string }
          return await createPortal(env, principal.org, body.returnTo ?? env.DASHBOARD_ORIGIN ?? '')
        }
        if (path.startsWith('/api/runners/') && path.endsWith('/logs')) {
          const runnerId = path.split('/')[3] ?? ''
          if (!(await belongsTo(env, runnerId, principal.org))) return forbidden()
          return runnerStub(env, runnerId).fetch('https://do/logs')
        }
        if (path.startsWith('/api/runners/') && path.endsWith('/watch')) {
          const runnerId = path.split('/')[3] ?? ''
          if (!(await belongsTo(env, runnerId, principal.org))) return forbidden()
          return runnerStub(env, runnerId).fetch(
            new Request('https://do/socket?role=observer', request),
          )
        }
        if (path.startsWith('/api/runners/') && path.endsWith('/command')) {
          const runnerId = path.split('/')[3] ?? ''
          if (!(await belongsTo(env, runnerId, principal.org))) return forbidden()
          return runnerStub(env, runnerId).fetch(
            new Request('https://do/command', {
              method: 'POST',
              body: await request.text(),
            }),
          )
        }
        if (path.startsWith('/api/runners/') && request.method === 'DELETE') {
          const runnerId = path.split('/')[3] ?? ''
          if (!(await belongsTo(env, runnerId, principal.org))) return forbidden()
          await env.DB.prepare('UPDATE runners SET revoked_at = ?1 WHERE id = ?2')
            .bind(nowIso(), runnerId)
            .run()
          return ok({ revoked: runnerId })
        }

        return fail('not_found', `No route for ${request.method} ${path}`, 404)
      }

      return fail('not_found', 'This Worker serves the API only.', 404)
    } catch (error) {
      // Never leak an internal message to a client.
      console.error('unhandled', error)
      return fail('internal', 'Something went wrong.', 500)
    } finally {
      void ctx
    }
  }
}

// ---------------------------------------------------------------------------

async function belongsTo(env: Env, runnerId: string, org: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM runners WHERE id = ?1 AND org = ?2')
    .bind(runnerId, org)
    .first<{ ok: number }>()
  return Boolean(row)
}

/**
 * Exchange a one-time enrollment token for a long-lived runner credential.
 *
 * The invite is consumed in the same statement that checks it, so two runners
 * racing the same token cannot both succeed.
 */
async function enroll(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    token?: string
    name?: string
    platform?: string
    cliVersion?: string
  } | null

  if (!body?.token) return fail('invalid_input', 'An enrollment token is required.')

  const inviteHash = await hashToken(env, body.token)
  const invite = await env.DB.prepare(
    `SELECT org, name_hint, expires_at, used_at FROM enroll_tokens WHERE token_hash = ?1`,
  )
    .bind(inviteHash)
    .first<{ org: string; name_hint: string | null; expires_at: string; used_at: string | null }>()

  if (!invite) return fail('invalid_token', 'That enrollment token is not valid.', 401)
  if (invite.used_at) return fail('token_used', 'That enrollment token has already been used.', 409)
  if (Date.parse(invite.expires_at) < Date.now()) {
    return fail('token_expired', 'That enrollment token has expired.', 410)
  }

  // The plan limit, checked before the invite is consumed so a refused
  // enrollment does not burn the token.
  const allowance = await canEnrollRunner(env, invite.org)
  if (!allowance.allowed) {
    return json(
      {
        ok: false,
        error: {
          code: 'runner_limit_reached',
          message: allowance.reason ?? 'Runner limit reached.',
          used: allowance.used,
          limit: allowance.limit,
          upgradeTo: allowance.upgradeTo,
        },
      },
      402,
    )
  }

  const runnerId = id('run')
  const rawToken = newToken()
  const tokenHash = await hashToken(env, rawToken)
  const name = body.name ?? invite.name_hint ?? runnerId

  const consumed = await env.DB.prepare(
    `UPDATE enroll_tokens SET used_at = ?1, runner_id = ?2
     WHERE token_hash = ?3 AND used_at IS NULL`,
  )
    .bind(nowIso(), runnerId, inviteHash)
    .run()

  if (!consumed.meta.changes) {
    return fail('token_used', 'That enrollment token has already been used.', 409)
  }

  await env.DB.prepare(
    `INSERT INTO runners (id, name, org, token_hash, platform, cli_version, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(runnerId, name, invite.org, tokenHash, body.platform ?? null, body.cliVersion ?? null, nowIso())
    .run()

  // The only time the raw token is ever transmitted.
  return ok({ runnerId, token: rawToken, org: invite.org, name }, 201)
}

async function createEnrollToken(
  request: Request,
  env: Env,
  org: string,
  createdBy: string,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { name?: string }
  const raw = newToken(24)
  const ttlMinutes = Number.parseInt(env.ENROLL_TOKEN_TTL_MINUTES ?? '30', 10) || 30
  const expires = new Date(Date.now() + ttlMinutes * 60_000).toISOString()

  await env.DB.prepare(
    `INSERT INTO enroll_tokens (token_hash, org, name_hint, created_by, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(await hashToken(env, raw), org, body.name ?? null, createdBy, nowIso(), expires)
    .run()

  return ok({ token: raw, expiresAt: expires, ttlMinutes }, 201)
}

async function listRunners(env: Env, org: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, name, platform, cli_version, config, created_at, last_seen_at, revoked_at
     FROM runners WHERE org = ?1 AND revoked_at IS NULL ORDER BY created_at`,
  )
    .bind(org)
    .all<Record<string, unknown>>()

  // Live state comes from each Durable Object, not the table — the table only
  // knows what was last written, the DO knows whether it is connected now.
  const runners = await Promise.all(
    (rows.results ?? []).map(async (row) => {
      const stub = runnerStub(env, String(row['id']))
      const state = await stub
        .fetch('https://do/state')
        .then((r) => r.json())
        .catch(() => ({ status: 'offline' }))
      return { ...row, state }
    }),
  )

  return ok({ runners })
}

async function runnerConfig(env: Env, runnerId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT config FROM runners WHERE id = ?1')
    .bind(runnerId)
    .first<{ config: string }>()

  let config: unknown = {}
  try {
    config = JSON.parse(row?.config ?? '{}')
  } catch {
    config = {}
  }
  return ok({ config })
}

async function claimJob(env: Env, runnerId: string, org: string): Promise<Response> {
  const pending = await env.DB.prepare(
    `SELECT id, project_slug, max_loops FROM jobs
     WHERE org = ?1 AND status = 'pending' ORDER BY created_at LIMIT 1`,
  )
    .bind(org)
    .first<{ id: string; project_slug: string; max_loops: number }>()

  if (!pending) return ok({ job: null })

  // Conditional update, so two runners polling simultaneously cannot both take
  // the same job.
  const claimed = await env.DB.prepare(
    `UPDATE jobs SET status = 'claimed', claimed_at = ?1, claimed_by = ?2
     WHERE id = ?3 AND status = 'pending'`,
  )
    .bind(nowIso(), runnerId, pending.id)
    .run()

  if (!claimed.meta.changes) return ok({ job: null })

  return ok({
    job: { id: pending.id, projectSlug: pending.project_slug, maxLoops: pending.max_loops },
  })
}

async function queueJob(
  request: Request,
  env: Env,
  org: string,
  requestedBy: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    projectSlug?: string
    maxLoops?: number
  } | null

  if (!body?.projectSlug) return fail('invalid_input', 'projectSlug is required.')

  const allowance = await canQueueJob(env, org)
  if (!allowance.allowed) {
    return json(
      {
        ok: false,
        error: {
          code: 'queue_limit_reached',
          message: allowance.reason ?? 'Queue limit reached.',
          used: allowance.used,
          limit: allowance.limit,
          upgradeTo: allowance.upgradeTo,
        },
      },
      402,
    )
  }

  const jobId = id('job')
  await env.DB.prepare(
    `INSERT INTO jobs (id, org, project_slug, max_loops, requested_by, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(jobId, org, body.projectSlug, body.maxLoops ?? 20, requestedBy, nowIso())
    .run()

  return ok({ jobId }, 201)
}

async function recordRun(request: Request, env: Env, runnerId: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    runId?: string
    projectSlug?: string
    branch?: string
    outcome?: string
    iterations?: number
    commits?: number
    costUsd?: number
    prUrl?: string
    failedTier?: string
    jobId?: string
  } | null

  if (!body?.runId || !body.projectSlug) {
    return fail('invalid_input', 'runId and projectSlug are required.')
  }

  await env.DB.prepare(
    `INSERT INTO runs (id, runner_id, project_slug, branch, started_at, finished_at,
                       outcome, iterations, commits, cost_usd, pr_url, failed_tier)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
     ON CONFLICT (id) DO UPDATE SET
       finished_at = excluded.finished_at,
       outcome     = excluded.outcome,
       iterations  = excluded.iterations,
       commits     = excluded.commits,
       cost_usd    = excluded.cost_usd,
       pr_url      = excluded.pr_url,
       failed_tier = excluded.failed_tier`,
  )
    .bind(
      body.runId, runnerId, body.projectSlug, body.branch ?? null,
      nowIso(), body.outcome ? nowIso() : null,
      body.outcome ?? 'running', body.iterations ?? 0, body.commits ?? 0,
      body.costUsd ?? 0, body.prUrl ?? null, body.failedTier ?? null,
    )
    .run()

  if (body.jobId && body.outcome) {
    await env.DB.prepare(
      `UPDATE jobs SET status = 'done', finished_at = ?1 WHERE id = ?2`,
    )
      .bind(nowIso(), body.jobId)
      .run()
  }

  return ok({ recorded: body.runId })
}

async function listRuns(env: Env, org: string, url: URL): Promise<Response> {
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)
  const rows = await env.DB.prepare(
    `SELECT r.* FROM runs r
     JOIN runners n ON n.id = r.runner_id
     WHERE n.org = ?1
     ORDER BY r.started_at DESC LIMIT ?2`,
  )
    .bind(org, limit)
    .all<Record<string, unknown>>()

  const spend = await env.DB.prepare(
    `SELECT COALESCE(SUM(r.cost_usd), 0) AS total FROM runs r
     JOIN runners n ON n.id = r.runner_id
     WHERE n.org = ?1 AND r.started_at >= datetime('now', '-1 day')`,
  )
    .bind(org)
    .first<{ total: number }>()

  return ok({ runs: rows.results ?? [], spentLast24h: spend?.total ?? 0 })
}

async function billingSummary(env: Env, org: string): Promise<Response> {
  const { plan, tag, limits } = await entitlementFor(env, org)
  const runners = await countRunners(env, org)

  return ok({
    plan: { id: plan.id, name: plan.name, priceLabel: plan.priceLabel },
    status: tag.status ?? 'active',
    limits,
    usage: { runners },
    hasSubscription: Boolean(tag.stripeCustomerId),
    plans: publicPlans(),
  })
}
