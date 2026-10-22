import { type Env, fail, ok, id, nowIso } from './env.ts'
import { putProjectSecret, validSecretName } from './secrets.ts'

/**
 * Credentials the agent asked for.
 *
 * The agent never invents a key or hard-codes one: it names what it needs and
 * why, and carries on with work that does not need it. A human answers in the
 * dashboard, the value becomes a project secret, and runners building that
 * project are told to pick it up at their next iteration boundary.
 */

const MAX_REASON = 500

export async function createRequest(
  request: Request,
  env: Env,
  org: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    project?: string
    name?: string
    reason?: string
    runId?: string
  } | null
  const name = body?.name ?? ''
  const problem = validSecretName(name)
  if (problem) return fail('invalid_name', problem)
  const reason = (body?.reason ?? '').trim().slice(0, MAX_REASON)
  if (!reason) return fail('invalid_input', 'Say what the credential is for.')

  const project = await env.DB.prepare('SELECT id FROM projects WHERE org = ?1 AND slug = ?2')
    .bind(org, body?.project ?? '')
    .first<{ id: string }>()
  if (!project) return fail('not_found', 'No such project.', 404)

  // Already there: the runner should just refetch its secrets.
  const existing = await env.DB.prepare(
    `SELECT 1 AS ok FROM secrets WHERE org = ?1 AND scope = 'project' AND project_id = ?2 AND name = ?3`,
  )
    .bind(org, project.id, name)
    .first()
  if (existing) return ok({ status: 'available' })

  await env.DB.prepare(
    `INSERT INTO secret_requests (id, org, project_id, name, reason, run_id, status, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)
     ON CONFLICT (project_id, name) WHERE status = 'pending' DO UPDATE SET
       reason = excluded.reason, run_id = excluded.run_id`,
  )
    .bind(id('req'), org, project.id, name, reason, body?.runId ?? null, nowIso())
    .run()
  return ok({ status: 'pending' }, 201)
}

export async function listRequests(env: Env, org: string, url: URL): Promise<Response> {
  const status = url.searchParams.get('status')
  const rows = await env.DB.prepare(
    `SELECT r.id, r.name, r.reason, r.status, r.run_id, r.created_at, r.resolved_at,
            p.id AS project_id, p.slug AS project_slug
     FROM secret_requests r JOIN projects p ON p.id = r.project_id
     WHERE r.org = ?1 AND (?2 IS NULL OR r.status = ?2)
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
     LIMIT 200`,
  )
    .bind(org, status)
    .all<Record<string, unknown>>()
  return ok({ requests: rows.results ?? [] })
}

async function pending(env: Env, org: string, requestId: string) {
  return env.DB.prepare(
    `SELECT r.id, r.name, r.project_id, p.slug FROM secret_requests r
     JOIN projects p ON p.id = r.project_id
     WHERE r.id = ?1 AND r.org = ?2 AND r.status = 'pending'`,
  )
    .bind(requestId, org)
    .first<{ id: string; name: string; project_id: string; slug: string }>()
}

export async function fulfillRequest(
  request: Request,
  env: Env,
  org: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const open = await pending(env, org, requestId)
  if (!open) return fail('not_found', 'No open request with that id.', 404)
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null
  if (typeof body?.value !== 'string' || !body.value) return fail('invalid_value', 'A value is required.')

  // Storing it resolves this request (and tells the runners), as it would
  // from the Secrets list.
  const stored = await putProjectSecret(env, org, userId, open.project_id, open.name, body.value)
  if (stored) return stored
  return ok({ fulfilled: requestId })
}

export async function dismissRequest(env: Env, org: string, userId: string, requestId: string): Promise<Response> {
  const open = await pending(env, org, requestId)
  if (!open) return fail('not_found', 'No open request with that id.', 404)
  await env.DB.prepare(
    `UPDATE secret_requests SET status = 'dismissed', resolved_at = ?1, resolved_by = ?2 WHERE id = ?3`,
  )
    .bind(nowIso(), userId, requestId)
    .run()
  return ok({ dismissed: requestId })
}
