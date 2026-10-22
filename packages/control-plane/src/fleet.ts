import { type Env, fail, ok, json, id, nowIso } from './env.ts'
import { hashToken, newToken } from './auth.ts'
import {
  canEnrollRunner, canQueueJob, projectIsRunnable, historyCutoff, monthlySpendAllows,
} from './billing/entitlements.ts'
import { sanitizeConfig, mergeConfigs, parseStoredConfig, type RunConfig } from './config.ts'

/**
 * Runners, jobs and runs: the fleet half of the control plane.
 *
 * Kept apart from the Worker entry point so it can be exercised under Node
 * against a real SQLite, without the Durable Object runtime.
 */

/** A claimed job whose runner has not been seen for this long is put back. */
export const DARK_RUNNER_MS = 10 * 60_000

export type RunnerMessage =
  | { type: 'command'; command: 'stop' }
  | { type: 'command'; command: 'run' }
  | { type: 'config-changed' }
  | { type: 'prd-changed'; project: string }

function runnerStub(env: Env, runnerId: string) {
  return env.RUNNER.get(env.RUNNER.idFromName(runnerId))
}

/** Deliver a message to runners' sockets. Best effort: an offline runner reads state at its next claim. */
export async function notifyRunners(
  env: Env,
  org: string,
  message: RunnerMessage,
  onlyRunnerId?: string,
): Promise<number> {
  const rows = onlyRunnerId
    ? [{ id: onlyRunnerId }]
    : ((await env.DB.prepare('SELECT id FROM runners WHERE org = ?1 AND revoked_at IS NULL')
        .bind(org)
        .all<{ id: string }>()).results ?? [])

  let delivered = 0
  await Promise.all(
    rows.map(async (row) => {
      try {
        const res = await runnerStub(env, row.id).fetch('https://do/command', {
          method: 'POST',
          body: JSON.stringify(message),
        })
        const body = (await res.json()) as { delivered?: number }
        delivered += body.delivered ?? 0
      } catch {
        /* the runner will pick the change up when it next claims */
      }
    }),
  )
  return delivered
}

export async function belongsTo(env: Env, runnerId: string, org: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT 1 AS ok FROM runners WHERE id = ?1 AND org = ?2 AND revoked_at IS NULL',
  )
    .bind(runnerId, org)
    .first<{ ok: number }>()
  return Boolean(row)
}

function limitReached(code: string, decision: { reason?: string; used?: number; limit?: number; upgradeTo?: string }): Response {
  return json(
    {
      ok: false,
      error: {
        code,
        message: decision.reason ?? 'Plan limit reached.',
        used: decision.used,
        limit: decision.limit,
        upgradeTo: decision.upgradeTo,
      },
    },
    402,
  )
}

// ---- enrollment -------------------------------------------------------------

/**
 * Exchange a one-time enrollment token for a long-lived runner credential.
 *
 * The invite is consumed in the same statement that checks it, so two runners
 * racing the same token cannot both succeed.
 */
export async function enroll(request: Request, env: Env): Promise<Response> {
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
  if (!allowance.allowed) return limitReached('runner_limit_reached', allowance)

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

export async function createEnrollToken(
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

// ---- runners -----------------------------------------------------------------

export async function listRunners(env: Env, org: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, name, platform, cli_version, conventions_ref, config,
            created_at, last_seen_at, revoked_at
     FROM runners WHERE org = ?1 AND revoked_at IS NULL ORDER BY created_at`,
  )
    .bind(org)
    .all<Record<string, unknown>>()

  // Live state comes from each Durable Object, not the table — the table only
  // knows what was last written, the DO knows whether it is connected now.
  const runners = await Promise.all(
    (rows.results ?? []).map(async (row) => {
      const state = await runnerStub(env, String(row['id']))
        .fetch('https://do/state')
        .then((r) => r.json())
        .catch(() => ({ status: 'offline' }))
      return { ...row, config: parseStoredConfig(row['config'] as string), state }
    }),
  )

  return ok({ runners })
}

async function orgConfig(env: Env, org: string): Promise<RunConfig> {
  const row = await env.DB.prepare('SELECT config FROM org_settings WHERE org = ?1')
    .bind(org)
    .first<{ config: string }>()
  return parseStoredConfig(row?.config)
}

async function storedRunnerConfig(env: Env, runnerId: string): Promise<RunConfig> {
  const row = await env.DB.prepare('SELECT config FROM runners WHERE id = ?1')
    .bind(runnerId)
    .first<{ config: string }>()
  return parseStoredConfig(row?.config)
}

async function projectConfig(env: Env, org: string, slug: string): Promise<RunConfig> {
  const row = await env.DB.prepare('SELECT config FROM projects WHERE org = ?1 AND slug = ?2')
    .bind(org, slug)
    .first<{ config: string }>()
  return parseStoredConfig(row?.config)
}

/**
 * Org defaults with the runner's own overrides, plus a project's when one is
 * named: exactly what a claim resolves, so a mid-run refresh matches what the
 * run started with. The dashboard URL rides along so a PR can link its run.
 */
export async function runnerConfig(
  env: Env,
  runnerId: string,
  org: string,
  project?: string | null,
): Promise<Response> {
  return ok({
    config: mergeConfigs(
      await orgConfig(env, org),
      await storedRunnerConfig(env, runnerId),
      project ? await projectConfig(env, org, project) : null,
    ),
    dashboardUrl: env.DASHBOARD_ORIGIN ?? null,
  })
}

/** Only `stop` and `run` may be relayed from a browser; nothing else reaches a runner. */
export async function commandRunner(
  request: Request,
  env: Env,
  org: string,
  runnerId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { command?: string } | null
  if (body?.command !== 'stop' && body?.command !== 'run') {
    return fail('invalid_input', 'command must be stop or run.')
  }
  const delivered = await notifyRunners(env, org, { type: 'command', command: body.command }, runnerId)
  return ok({ delivered })
}

// ---- configuration -------------------------------------------------------------

async function readBody(request: Request): Promise<{ config: RunConfig } | Response> {
  const body = (await request.json().catch(() => null)) as { config?: unknown } | null
  const { config, errors } = sanitizeConfig(body?.config)
  if (errors.length) {
    return json({ ok: false, error: { code: 'invalid_config', message: errors.join('; '), fields: errors } }, 400)
  }
  return { config }
}

export async function getSettings(env: Env, org: string): Promise<Response> {
  return ok({ config: await orgConfig(env, org) })
}

export async function putSettings(
  request: Request,
  env: Env,
  org: string,
  updatedBy: string,
): Promise<Response> {
  const parsed = await readBody(request)
  if (parsed instanceof Response) return parsed
  await env.DB.prepare(
    `INSERT INTO org_settings (org, config, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (org) DO UPDATE SET
       config = excluded.config, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(org, JSON.stringify(parsed.config), nowIso(), updatedBy)
    .run()
  await notifyRunners(env, org, { type: 'config-changed' })
  return ok({ config: parsed.config })
}

export async function putRunnerConfig(
  request: Request,
  env: Env,
  org: string,
  runnerId: string,
): Promise<Response> {
  if (!(await belongsTo(env, runnerId, org))) return fail('not_found', 'No such runner.', 404)
  const parsed = await readBody(request)
  if (parsed instanceof Response) return parsed
  await env.DB.prepare('UPDATE runners SET config = ?1 WHERE id = ?2')
    .bind(JSON.stringify(parsed.config), runnerId)
    .run()
  await notifyRunners(env, org, { type: 'config-changed' }, runnerId)
  return ok({ config: parsed.config })
}

export async function getProjectConfig(env: Env, org: string, projectId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT config FROM projects WHERE id = ?1 AND org = ?2')
    .bind(projectId, org)
    .first<{ config: string }>()
  if (!row) return fail('not_found', 'No such project.', 404)
  return ok({ config: parseStoredConfig(row.config) })
}

export async function putProjectConfig(
  request: Request,
  env: Env,
  org: string,
  projectId: string,
): Promise<Response> {
  const parsed = await readBody(request)
  if (parsed instanceof Response) return parsed
  const result = await env.DB.prepare('UPDATE projects SET config = ?1 WHERE id = ?2 AND org = ?3')
    .bind(JSON.stringify(parsed.config), projectId, org)
    .run()
  if (!result.meta.changes) return fail('not_found', 'No such project.', 404)
  await notifyRunners(env, org, { type: 'config-changed' })
  return ok({ config: parsed.config })
}

// ---- jobs ------------------------------------------------------------------------

/**
 * Put back work that cannot finish.
 *
 * A job claimed by a runner that has gone dark goes back to the queue for
 * another machine. A job still marked as claimed by the *caller*, which only
 * asks for work when idle, died with its process: it is abandoned rather than
 * re-run, because whatever killed it would most likely kill it again.
 */
async function reclaimStaleJobs(env: Env, org: string, runnerId: string): Promise<void> {
  const darkSince = new Date(Date.now() - DARK_RUNNER_MS).toISOString()
  await env.DB.prepare(
    `UPDATE jobs SET status = 'pending', claimed_at = NULL, claimed_by = NULL
     WHERE org = ?1 AND status = 'claimed' AND claimed_by != ?2
       AND claimed_by IN (
         SELECT id FROM runners
         WHERE org = ?1 AND (revoked_at IS NOT NULL OR last_seen_at IS NULL OR last_seen_at < ?3)
       )`,
  )
    .bind(org, runnerId, darkSince)
    .run()

  const orphaned = await env.DB.prepare(
    `SELECT id FROM jobs WHERE org = ?1 AND status = 'claimed' AND claimed_by = ?2`,
  )
    .bind(org, runnerId)
    .all<{ id: string }>()
  for (const job of orphaned.results ?? []) {
    await env.DB.prepare(`UPDATE jobs SET status = 'abandoned', finished_at = ?1 WHERE id = ?2`)
      .bind(nowIso(), job.id)
      .run()
    await env.DB.prepare(
      `UPDATE runs SET outcome = 'aborted', finished_at = ?1 WHERE job_id = ?2 AND outcome = 'running'`,
    )
      .bind(nowIso(), job.id)
      .run()
  }
}

export async function claimJob(env: Env, runnerId: string, org: string): Promise<Response> {
  await reclaimStaleJobs(env, org, runnerId)

  const pending = await env.DB.prepare(
    `SELECT id, project_slug, max_loops FROM jobs
     WHERE org = ?1 AND status = 'pending' AND (runner_id IS NULL OR runner_id = ?2)
     ORDER BY (runner_id IS NULL), created_at LIMIT 1`,
  )
    .bind(org, runnerId)
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

  // The run's whole configuration, resolved once. The runner layers it over its
  // local config.json and does not consult the control plane for it again.
  const config = mergeConfigs(
    await orgConfig(env, org),
    await storedRunnerConfig(env, runnerId),
    await projectConfig(env, org, pending.project_slug),
  )

  return ok({
    job: { id: pending.id, projectSlug: pending.project_slug, maxLoops: pending.max_loops, config },
  })
}

export async function queueJob(
  request: Request,
  env: Env,
  org: string,
  requestedBy: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    projectSlug?: string
    maxLoops?: number
    runnerId?: string
  } | null

  if (!body?.projectSlug) return fail('invalid_input', 'projectSlug is required.')
  const maxLoops = body.maxLoops ?? 20
  if (!Number.isInteger(maxLoops) || maxLoops < 1 || maxLoops > 200) {
    return fail('invalid_input', 'maxLoops must be an integer between 1 and 200.')
  }

  // Refuse up front rather than letting the runner discover at clone time that
  // it has no credential for this repository.
  const runnable = await projectIsRunnable(env, org, body.projectSlug)
  if (!runnable.allowed) {
    return fail('project_not_runnable', runnable.reason ?? 'That project cannot run.', 409)
  }

  if (body.runnerId && !(await belongsTo(env, body.runnerId, org))) {
    return fail('not_found', 'No such runner.', 404)
  }

  const allowance = await canQueueJob(env, org)
  if (!allowance.allowed) return limitReached('queue_limit_reached', allowance)

  const spend = await monthlySpendAllows(env, org)
  if (!spend.allowed) return limitReached('spend_cap_reached', spend)

  const jobId = id('job')
  await env.DB.prepare(
    `INSERT INTO jobs (id, org, project_slug, max_loops, requested_by, created_at, runner_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(jobId, org, body.projectSlug, maxLoops, requestedBy, nowIso(), body.runnerId ?? null)
    .run()

  // A nudge, not an instruction: the runner still claims through D1, which stays
  // the one source of truth, it just does so now rather than at its next poll.
  await notifyRunners(env, org, { type: 'command', command: 'run' }, body.runnerId)

  return ok({ jobId }, 201)
}

// ---- runs ------------------------------------------------------------------------

export async function recordRun(
  request: Request,
  env: Env,
  runnerId: string,
  org: string,
): Promise<Response> {
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
    agents?: unknown
  } | null

  if (!body?.runId || !body.projectSlug) {
    return fail('invalid_input', 'runId and projectSlug are required.')
  }

  // A job id is only recorded if it is this org's — a runner cannot attach its
  // run to another tenant's job.
  let jobId: string | null = null
  if (body.jobId) {
    const job = await env.DB.prepare('SELECT id FROM jobs WHERE id = ?1 AND org = ?2')
      .bind(body.jobId, org)
      .first<{ id: string }>()
    jobId = job?.id ?? null
  }

  await env.DB.prepare(
    `INSERT INTO runs (id, runner_id, org, job_id, project_slug, branch, started_at, finished_at,
                       outcome, iterations, commits, cost_usd, pr_url, failed_tier, agents)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
     ON CONFLICT (id) DO UPDATE SET
       finished_at = excluded.finished_at,
       outcome     = excluded.outcome,
       iterations  = excluded.iterations,
       commits     = excluded.commits,
       cost_usd    = excluded.cost_usd,
       pr_url      = excluded.pr_url,
       failed_tier = excluded.failed_tier,
       agents      = COALESCE(excluded.agents, runs.agents)
     WHERE runs.runner_id = excluded.runner_id`,
  )
    .bind(
      body.runId, runnerId, org, jobId, body.projectSlug, body.branch ?? null,
      nowIso(), body.outcome ? nowIso() : null,
      body.outcome ?? 'running', body.iterations ?? 0, body.commits ?? 0,
      body.costUsd ?? 0, body.prUrl ?? null, body.failedTier ?? null,
      body.agents ? JSON.stringify(body.agents) : null,
    )
    .run()

  if (jobId && body.outcome) {
    await env.DB.prepare(`UPDATE jobs SET status = 'done', finished_at = ?1 WHERE id = ?2`)
      .bind(nowIso(), jobId)
      .run()
  }

  return ok({ recorded: body.runId })
}

export async function listRuns(env: Env, org: string, url: URL): Promise<Response> {
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)
  const project = url.searchParams.get('project')
  // The plan's history window is enforced here, not in the dashboard.
  const since = await historyCutoff(env, org)

  const rows = await env.DB.prepare(
    `SELECT id, runner_id, job_id, project_slug, branch, started_at, finished_at, outcome,
            iterations, commits, cost_usd, pr_url, pr_state, failed_tier
     FROM runs
     WHERE org = ?1 AND started_at >= ?2 AND (?3 IS NULL OR project_slug = ?3)
     ORDER BY started_at DESC LIMIT ?4`,
  )
    .bind(org, since, project, limit)
    .all<Record<string, unknown>>()

  const spend = await env.DB.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM runs
     WHERE org = ?1 AND started_at >= ?2`,
  )
    .bind(org, new Date(Date.now() - 86_400_000).toISOString())
    .first<{ total: number }>()

  return ok({ runs: rows.results ?? [], spentLast24h: spend?.total ?? 0 })
}

/** One run, plus the runner's live state when this is the run it is on now. */
export async function getRun(env: Env, org: string, runId: string): Promise<Response> {
  const run = await env.DB.prepare(
    `SELECT r.*, n.name AS runner_name FROM runs r
     LEFT JOIN runners n ON n.id = r.runner_id
     WHERE r.id = ?1 AND r.org = ?2 AND r.started_at >= ?3`,
  )
    .bind(runId, org, await historyCutoff(env, org))
    .first<Record<string, unknown>>()
  if (!run) return fail('not_found', 'No such run.', 404)

  let live: unknown = null
  if (run['outcome'] === 'running' && typeof run['runner_id'] === 'string') {
    const state = (await runnerStub(env, run['runner_id'])
      .fetch('https://do/state')
      .then((r) => r.json())
      .catch(() => null)) as { runId?: string } | null
    if (state?.runId === runId) live = state
  }

  let agents: unknown = null
  try {
    agents = typeof run['agents'] === 'string' ? JSON.parse(run['agents']) : null
  } catch {
    agents = null
  }

  return ok({ run: { ...run, agents }, live })
}
