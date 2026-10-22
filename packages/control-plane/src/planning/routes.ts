import { type Env, fail, ok, json, id, nowIso } from '../env.ts'
import { canGeneratePlan, usageMonth } from '../billing/entitlements.ts'
import { commitFile } from '../integrations/github.ts'
import { notifyRunners } from '../fleet.ts'
import { checkPrd, lineDiff } from './prd.ts'
import { generatePlan, PlanError, type PlanRequest, type PlannerClient } from './planner.ts'

/**
 * Plans: generate, refine, edit, approve.
 *
 * Every change is a new version; nothing is edited in place. Approval writes
 * PRD.md to the repository — the runner never reads a plan from here, only from
 * git, so the repository stays the single source of truth for what to build.
 */

const MAX_IDEA = 20_000
const MAX_PRD = 200_000

interface ProjectRow {
  id: string
  slug: string
  default_branch: string
  external_id: string
  installation_id: string
  integration_revoked: string | null
}

async function project(env: Env, org: string, projectId: string): Promise<ProjectRow | null> {
  return env.DB.prepare(
    `SELECT p.id, p.slug, p.default_branch, p.external_id,
            i.external_id AS installation_id, i.revoked_at AS integration_revoked
     FROM projects p JOIN integrations i ON i.id = p.integration_id
     WHERE p.id = ?1 AND p.org = ?2`,
  )
    .bind(projectId, org)
    .first<ProjectRow>()
}

async function latest(env: Env, projectId: string): Promise<{ version: number; prd: string } | null> {
  return env.DB.prepare('SELECT version, prd FROM plans WHERE project_id = ?1 ORDER BY version DESC LIMIT 1')
    .bind(projectId)
    .first<{ version: number; prd: string }>()
}

async function insertVersion(
  env: Env,
  row: { org: string; projectId: string; source: string; prd: string; prompt: string | null; model: string | null; createdBy: string },
): Promise<{ id: string; version: number }> {
  const previous = await latest(env, row.projectId)
  const version = (previous?.version ?? 0) + 1
  const planId = id('pln')
  await env.DB.prepare(
    `INSERT INTO plans (id, org, project_id, version, status, source, prd, prompt, model, created_by, created_at)
     VALUES (?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?7, ?8, ?9, ?10)`,
  )
    .bind(planId, row.org, row.projectId, version, row.source, row.prd, row.prompt, row.model, row.createdBy, nowIso())
    .run()
  return { id: planId, version }
}

export async function listPlans(env: Env, org: string, projectId: string): Promise<Response> {
  if (!(await project(env, org, projectId))) return fail('not_found', 'No such project.', 404)
  const rows = await env.DB.prepare(
    `SELECT id, version, status, source, prompt, model, created_at, approved_at, commit_sha, pr_url
     FROM plans WHERE project_id = ?1 AND org = ?2 ORDER BY version DESC`,
  )
    .bind(projectId, org)
    .all<Record<string, unknown>>()
  return ok({ plans: rows.results ?? [] })
}

/** One version, its checks, and what changed since the version before it. */
export async function getPlan(env: Env, org: string, projectId: string, version: number): Promise<Response> {
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE project_id = ?1 AND org = ?2 AND version = ?3')
    .bind(projectId, org, version)
    .first<Record<string, unknown> & { prd: string }>()
  if (!plan) return fail('not_found', 'No such plan version.', 404)
  const previous = await env.DB.prepare('SELECT prd FROM plans WHERE project_id = ?1 AND version = ?2')
    .bind(projectId, version - 1)
    .first<{ prd: string }>()
  return ok({
    plan,
    check: checkPrd(plan.prd),
    diff: previous ? lineDiff(previous.prd, plan.prd) : null,
  })
}

/** A hand edit: a new version, validated like a generated one. */
export async function editPlan(
  request: Request,
  env: Env,
  org: string,
  userId: string,
  projectId: string,
): Promise<Response> {
  if (!(await project(env, org, projectId))) return fail('not_found', 'No such project.', 404)
  const body = (await request.json().catch(() => null)) as { prd?: unknown } | null
  if (typeof body?.prd !== 'string' || !body.prd.trim()) return fail('invalid_input', 'prd is required.')
  if (body.prd.length > MAX_PRD) return fail('invalid_input', 'That PRD is too long.')
  const prd = body.prd.endsWith('\n') ? body.prd : `${body.prd}\n`
  const saved = await insertVersion(env, { org, projectId, source: 'edited', prd, prompt: null, model: null, createdBy: userId })
  return ok({ ...saved, check: checkPrd(prd) }, 201)
}

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/**
 * Generate or refine, streamed as server-sent events: `delta` while the PRD is
 * written, then `done` with the saved version, or `error`.
 *
 * A fetch body rather than EventSource on the client, because EventSource
 * cannot send the Authorization header.
 */
export async function streamPlan(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  org: string,
  userId: string,
  projectId: string,
  deps: { client?: PlannerClient; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const row = await project(env, org, projectId)
  if (!row) return fail('not_found', 'No such project.', 404)

  const body = (await request.json().catch(() => null)) as { idea?: unknown; instruction?: unknown } | null
  const projectName = row.slug.replace('__', '/')
  let planRequest: PlanRequest
  if (typeof body?.instruction === 'string' && body.instruction.trim()) {
    const current = await latest(env, projectId)
    if (!current) return fail('no_plan', 'There is no plan to refine yet — describe the idea first.', 409)
    planRequest = { mode: 'refine', currentPrd: current.prd, instruction: body.instruction.slice(0, MAX_IDEA), projectName }
  } else if (typeof body?.idea === 'string' && body.idea.trim()) {
    planRequest = { mode: 'create', idea: body.idea.slice(0, MAX_IDEA), projectName }
  } else {
    return fail('invalid_input', 'Describe the idea, or what to change.')
  }

  const allowance = await canGeneratePlan(env, org)
  if (!allowance.allowed) {
    return json({ ok: false, error: { code: 'plan_limit_reached', message: allowance.reason, ...allowance } }, 402)
  }

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const write = (event: string, data: unknown) => writer.write(sse(event, data)).catch(() => {})

  const work = (async () => {
    try {
      const result = await generatePlan(env, planRequest, (text) => void write('delta', { text }), deps)
      // Counted once it succeeded: a refusal or an outage should not cost the org an allowance.
      await env.DB.prepare(
        `INSERT INTO ai_usage (org, month, generations, input_tokens, output_tokens) VALUES (?1, ?2, 1, ?3, ?4)
         ON CONFLICT (org, month) DO UPDATE SET
           generations = generations + 1,
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens`,
      )
        .bind(org, usageMonth(), result.usage.inputTokens, result.usage.outputTokens)
        .run()
      const saved = await insertVersion(env, {
        org,
        projectId,
        source: planRequest.mode === 'create' ? 'generated' : 'refined',
        prd: result.prd,
        prompt: planRequest.mode === 'create' ? planRequest.idea : planRequest.instruction,
        model: result.model,
        createdBy: userId,
      })
      await write('done', { ...saved, check: result.check, usage: result.usage })
    } catch (error) {
      const code = error instanceof PlanError ? error.code : 'planner_failed'
      const message = error instanceof PlanError ? error.message : 'The planner failed. Try again in a moment.'
      if (!(error instanceof PlanError)) console.error('plan generation failed', error)
      await write('error', { code, message })
    } finally {
      await writer.close().catch(() => {})
    }
  })()
  ctx.waitUntil(work)

  return new Response(readable, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Approve a version: write it to the repository as PRD.md, and tell runners
 * building this project to pick it up at their next iteration.
 */
export async function approvePlan(
  env: Env,
  org: string,
  userId: string,
  projectId: string,
  version: number,
): Promise<Response> {
  const row = await project(env, org, projectId)
  if (!row) return fail('not_found', 'No such project.', 404)
  if (row.integration_revoked) return fail('integration_revoked', 'The GitHub App was uninstalled for this project.', 409)

  const plan = await env.DB.prepare('SELECT id, prd, status FROM plans WHERE project_id = ?1 AND org = ?2 AND version = ?3')
    .bind(projectId, org, version)
    .first<{ id: string; prd: string; status: string }>()
  if (!plan) return fail('not_found', 'No such plan version.', 404)

  const check = checkPrd(plan.prd)
  if (!check.ok) {
    return json({ ok: false, error: { code: 'invalid_plan', message: check.errors.join('; '), fields: check.errors } }, 400)
  }

  const outcome = await commitFile(env, row.installation_id, row.slug.replace('__', '/'), {
    path: 'PRD.md',
    content: plan.prd,
    message: `docs: project plan v${version}`,
    branch: row.default_branch,
    prBranch: `circon/plan-v${version}`,
    prTitle: `docs: project plan v${version}`,
    prBody: `The project plan approved in circon (version ${version}, ${check.tasks.length} tasks).\n\nMerge this to let runners build from it.`,
  })
  if (outcome.kind === 'failed') return fail('github_error', `Could not write PRD.md: ${outcome.reason}.`, 502)

  await env.DB.prepare(`UPDATE plans SET status = 'superseded' WHERE project_id = ?1 AND status = 'approved'`)
    .bind(projectId)
    .run()
  await env.DB.prepare(
    `UPDATE plans SET status = 'approved', approved_at = ?1, approved_by = ?2, commit_sha = ?3, pr_url = ?4 WHERE id = ?5`,
  )
    .bind(
      nowIso(), userId,
      outcome.kind === 'committed' ? outcome.sha : null,
      outcome.kind === 'pull-request' ? outcome.url : null,
      plan.id,
    )
    .run()

  // Only a direct commit is live on the default branch; a PR is not until merged.
  if (outcome.kind === 'committed') await notifyRunners(env, org, { type: 'prd-changed', project: row.slug })

  return ok({ version, ...outcome })
}
