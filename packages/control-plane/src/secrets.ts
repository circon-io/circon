import { type Env, fail, ok, id, nowIso } from './env.ts'
import { base64url } from './integrations/github.ts'

/**
 * Org and project credentials, handed to runners per job.
 *
 * Distributing secrets puts every credential within the control plane's blast
 * radius, so the scoping is the point: a runner receives the org's machine
 * secrets plus those of the one project it was dispatched for, holds them in
 * memory for that job, and nothing else. Values never go back to a browser.
 *
 * AES-GCM with a random IV per value; the key lives only in the Worker secret
 * SECRETS_MASTER_KEY (32 random bytes, base64). Cloudflare Secrets Store was
 * the obvious alternative and is the wrong shape: it is account-level and
 * quota-bound, built for an operator's handful of secrets, not one set per
 * customer project.
 */

export type SecretScope = 'machine' | 'project'

const NAME = /^[A-Z][A-Z0-9_]{0,63}$/
const MAX_VALUE = 32 * 1024
/**
 * Never injected, whatever the dashboard says: these change how every process
 * on the runner behaves, not what one project can reach.
 */
const RESERVED = new Set([
  'PATH', 'HOME', 'USER', 'SHELL', 'PWD', 'NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_CONFIG', 'GIT_ASKPASS', 'SSH_AUTH_SOCK',
  'CIRCON_HOME', 'CIRCON_PROJECTS', 'ANDROID_HOME',
])

export function validSecretName(name: string): string | null {
  if (!NAME.test(name)) return 'names are upper case letters, digits and underscores, starting with a letter'
  if (RESERVED.has(name)) return `${name} controls the runner itself and cannot be set as a secret`
  return null
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function masterKey(env: Env): Promise<CryptoKey> {
  if (!env.SECRETS_MASTER_KEY) throw new Error('SECRETS_MASTER_KEY is not set')
  const raw = fromBase64(env.SECRETS_MASTER_KEY)
  if (raw.length !== 32) throw new Error('SECRETS_MASTER_KEY must be 32 bytes, base64-encoded')
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/**
 * The value is bound to where it belongs (org, scope, project, name) as
 * additional authenticated data, so a ciphertext copied into another org's row
 * fails to decrypt instead of leaking.
 */
function aad(org: string, scope: string, projectId: string, name: string): Uint8Array {
  return new TextEncoder().encode(`${org}\u0000${scope}\u0000${projectId}\u0000${name}`)
}

export async function seal(
  env: Env,
  where: { org: string; scope: SecretScope; projectId: string; name: string },
  value: string,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(where.org, where.scope, where.projectId, where.name) },
    await masterKey(env),
    new TextEncoder().encode(value),
  )
  return { ciphertext: base64url(sealed), iv: base64url(iv) }
}

export async function open(
  env: Env,
  where: { org: string; scope: string; projectId: string; name: string },
  sealed: { ciphertext: string; iv: string },
): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData: aad(where.org, where.scope, where.projectId, where.name) },
    await masterKey(env),
    fromBase64(sealed.ciphertext),
  )
  return new TextDecoder().decode(plain)
}

async function projectBelongs(env: Env, org: string, projectId: string): Promise<boolean> {
  return Boolean(
    await env.DB.prepare('SELECT 1 AS ok FROM projects WHERE id = ?1 AND org = ?2').bind(projectId, org).first(),
  )
}

/** Names and dates only — never values. */
export async function listSecrets(env: Env, org: string, url: URL): Promise<Response> {
  const scope = url.searchParams.get('scope') === 'project' ? 'project' : 'machine'
  const projectId = scope === 'project' ? (url.searchParams.get('projectId') ?? '') : ''
  if (scope === 'project' && !(await projectBelongs(env, org, projectId))) return fail('not_found', 'No such project.', 404)
  const rows = await env.DB.prepare(
    `SELECT id, name, updated_at, updated_by FROM secrets
     WHERE org = ?1 AND scope = ?2 AND project_id = ?3 ORDER BY name`,
  )
    .bind(org, scope, projectId)
    .all<Record<string, unknown>>()
  return ok({ secrets: rows.results ?? [] })
}

export async function putSecret(request: Request, env: Env, org: string, userId: string): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    scope?: string
    projectId?: string
    name?: string
    value?: string
  } | null
  const scope: SecretScope = body?.scope === 'project' ? 'project' : 'machine'
  const projectId = scope === 'project' ? (body?.projectId ?? '') : ''
  const name = body?.name ?? ''
  const value = body?.value ?? ''

  const nameProblem = validSecretName(name)
  if (nameProblem) return fail('invalid_name', nameProblem)
  if (!value || value.length > MAX_VALUE) return fail('invalid_value', 'A value between 1 byte and 32 KB is required.')
  if (scope === 'project' && !(await projectBelongs(env, org, projectId))) return fail('not_found', 'No such project.', 404)
  if (!env.SECRETS_MASTER_KEY) return fail('not_configured', 'SECRETS_MASTER_KEY is not set on the API Worker.', 503)

  await store(env, { org, scope, projectId, name, userId }, value)
  return ok({ name, scope })
}

/** Seal and upsert one value. */
async function store(
  env: Env,
  where: { org: string; scope: SecretScope; projectId: string; name: string; userId: string },
  value: string,
): Promise<void> {
  const { org, scope, projectId, name, userId } = where
  const sealed = await seal(env, { org, scope, projectId, name }, value)
  await env.DB.prepare(
    `INSERT INTO secrets (id, org, scope, project_id, name, ciphertext, iv, updated_at, updated_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     ON CONFLICT (org, scope, project_id, name) DO UPDATE SET
       ciphertext = excluded.ciphertext, iv = excluded.iv,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(id('sec'), org, scope, projectId, name, sealed.ciphertext, sealed.iv, nowIso(), userId)
    .run()
}

/** For answering an agent's request: a project secret, validated like any other. Null on success. */
export async function putProjectSecret(
  env: Env,
  org: string,
  userId: string,
  projectId: string,
  name: string,
  value: string,
): Promise<Response | null> {
  const nameProblem = validSecretName(name)
  if (nameProblem) return fail('invalid_name', nameProblem)
  if (!value || value.length > MAX_VALUE) return fail('invalid_value', 'A value between 1 byte and 32 KB is required.')
  if (!(await projectBelongs(env, org, projectId))) return fail('not_found', 'No such project.', 404)
  if (!env.SECRETS_MASTER_KEY) return fail('not_configured', 'SECRETS_MASTER_KEY is not set on the API Worker.', 503)
  await store(env, { org, scope: 'project', projectId, name, userId }, value)
  return null
}

export async function deleteSecret(env: Env, org: string, secretId: string): Promise<Response> {
  const result = await env.DB.prepare('DELETE FROM secrets WHERE id = ?1 AND org = ?2').bind(secretId, org).run()
  if (!result.meta.changes) return fail('not_found', 'No such secret.', 404)
  return ok({ deleted: secretId })
}

/**
 * What a runner receives for a job: the org's machine secrets, then the job's
 * project's secrets on top. Only for a job this runner has claimed and not yet
 * finished — a finished job's credentials are not handed out again.
 */
export async function secretsForJob(env: Env, runnerId: string, org: string, jobId: string): Promise<Response> {
  const job = await env.DB.prepare(
    `SELECT j.project_slug, p.id AS project_id FROM jobs j
     JOIN projects p ON p.org = j.org AND p.slug = j.project_slug
     WHERE j.id = ?1 AND j.org = ?2 AND j.claimed_by = ?3 AND j.status = 'claimed'`,
  )
    .bind(jobId, org, runnerId)
    .first<{ project_slug: string; project_id: string }>()
  if (!job) return fail('not_found', 'No job of yours is running with that id.', 404)

  const rows = await env.DB.prepare(
    `SELECT scope, project_id, name, ciphertext, iv FROM secrets
     WHERE org = ?1 AND (scope = 'machine' OR (scope = 'project' AND project_id = ?2))
     ORDER BY CASE scope WHEN 'machine' THEN 0 ELSE 1 END`,
  )
    .bind(org, job.project_id)
    .all<{ scope: string; project_id: string; name: string; ciphertext: string; iv: string }>()

  const values: Record<string, string> = {}
  for (const row of rows.results ?? []) {
    try {
      values[row.name] = await open(env, { org, scope: row.scope, projectId: row.project_id, name: row.name }, row)
    } catch (error) {
      // One undecryptable value must not withhold the rest of a job's credentials.
      console.error('could not open secret', row.name, error)
    }
  }
  return ok({ secrets: values })
}
