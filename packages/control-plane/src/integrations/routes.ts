import { type Env, fail, ok, json, id, nowIso } from '../env.ts'
import type { Principal } from '../auth.ts'
import { canAddIntegration, canAddProject } from '../billing/entitlements.ts'
import {
  createPullRequest, installUrl, installationToken, listRepositories, verifyWebhook,
} from './github.ts'

/**
 * Connecting GitHub, and turning a repository into a project.
 *
 * The org never sees an App JWT or an installation token — it sees an install
 * link, a list of repositories, and projects. Tokens are minted on demand,
 * scoped to one repository, and never stored.
 */

/**
 * `owner/repo` ⇢ `owner__repo`, or null if it cannot round-trip.
 *
 * The slug is not cosmetic: it is the directory name the runner clones into and
 * the string `cloneToken` splits back into owner and repo. So two things are
 * rejected here rather than at clone time, minutes later on another machine:
 *
 *   - anything that is not exactly one path segment each side. `..` or a stray
 *     slash would escape the runner's projects root.
 *   - a name containing `__`, which is the separator. `a__b/c` and `a/b__c` both
 *     produce `a__b__c`, and splitting that back gives the wrong repository.
 *
 * GitHub allows `__` in repository names, so this is a real if rare exclusion,
 * and it is better stated plainly than resolved by guessing.
 */
export function slugFor(fullName: string): string | null {
  const parts = fullName.split('/')
  if (parts.length !== 2) return null
  return parts.every(
    (part) => /^[A-Za-z0-9][\w.-]*$/.test(part) && !part.includes('..') && !part.includes('__'),
  )
    ? parts.join('__')
    : null
}

function limitResponse(decision: Awaited<ReturnType<typeof canAddProject>>): Response {
  return json(
    {
      ok: false,
      error: {
        code: 'limit_reached',
        message: decision.reason ?? 'Plan limit reached.',
        used: decision.used,
        limit: decision.limit,
        upgradeTo: decision.upgradeTo,
      },
    },
    402,
  )
}

/** Where to send the browser to install the App. */
export function githubInstallUrl(env: Env, principal: Principal): Response {
  if (!env.GITHUB_APP_SLUG) {
    return fail('not_configured', 'GITHUB_APP_SLUG is not set on the API Worker.', 503)
  }
  // `state` carries the org through the redirect, so the callback knows who
  // installed it without trusting anything the browser sends back.
  return ok({ url: installUrl(env, principal.org) })
}

export async function listIntegrations(env: Env, org: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, provider, account_login, account_type, created_at, revoked_at
     FROM integrations WHERE org = ?1 ORDER BY created_at`,
  )
    .bind(org)
    .all<Record<string, unknown>>()
  return ok({ integrations: rows.results ?? [] })
}

/**
 * Repositories available to connect.
 *
 * Already-connected ones are marked rather than hidden, so it is obvious why a
 * repo is missing from the choices.
 */
export async function listAvailableRepos(
  env: Env,
  org: string,
  integrationId: string,
): Promise<Response> {
  const integration = await env.DB.prepare(
    'SELECT external_id FROM integrations WHERE id = ?1 AND org = ?2 AND revoked_at IS NULL',
  )
    .bind(integrationId, org)
    .first<{ external_id: string }>()

  if (!integration) return fail('not_found', 'No such integration.', 404)

  try {
    const repos = await listRepositories(env, integration.external_id)
    const connected = await env.DB.prepare(
      'SELECT external_id FROM projects WHERE org = ?1',
    )
      .bind(org)
      .all<{ external_id: string }>()
    const taken = new Set((connected.results ?? []).map((r) => r.external_id))

    return ok({
      repositories: repos.map((repo) => ({ ...repo, connected: taken.has(repo.id) })),
    })
  } catch (error) {
    return fail(
      'github_error',
      error instanceof Error ? error.message : 'Could not list repositories.',
      502,
    )
  }
}

export async function listProjects(env: Env, org: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT p.id, p.slug, p.status, p.default_branch, p.created_at,
            i.account_login, i.provider, i.revoked_at AS integration_revoked
     FROM projects p JOIN integrations i ON i.id = p.integration_id
     WHERE p.org = ?1 ORDER BY p.created_at`,
  )
    .bind(org)
    .all<Record<string, unknown>>()
  return ok({ projects: rows.results ?? [] })
}

/** Connect a repository: this is what creates a project. */
export async function createProject(
  request: Request,
  env: Env,
  org: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    integrationId?: string
    repoId?: string
    fullName?: string
    defaultBranch?: string
  } | null

  if (!body?.integrationId || !body.repoId || !body.fullName) {
    return fail('invalid_input', 'integrationId, repoId and fullName are required.')
  }

  const allowance = await canAddProject(env, org)
  if (!allowance.allowed) return limitResponse(allowance)

  const integration = await env.DB.prepare(
    'SELECT id FROM integrations WHERE id = ?1 AND org = ?2 AND revoked_at IS NULL',
  )
    .bind(body.integrationId, org)
    .first<{ id: string }>()
  if (!integration) return fail('not_found', 'No such integration.', 404)

  // The same string is the dashboard identifier, the runner's directory name and
  // the job payload — so it is validated once, here.
  const slug = slugFor(body.fullName)
  if (!slug) {
    return fail(
      'unsupported_name',
      `"${body.fullName}" cannot be used as a project. Repository and owner names ` +
        'must be plain identifiers and must not contain a double underscore.',
    )
  }

  try {
    await env.DB.prepare(
      `INSERT INTO projects
         (id, org, integration_id, slug, external_id, default_branch, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', ?7)`,
    )
      .bind(
        id('prj'), org, body.integrationId, slug, body.repoId,
        body.defaultBranch ?? 'main', nowIso(),
      )
      .run()
  } catch {
    return fail('already_connected', `${body.fullName} is already connected.`, 409)
  }

  return ok({ slug }, 201)
}

export async function deleteProject(env: Env, org: string, projectId: string): Promise<Response> {
  const result = await env.DB.prepare('DELETE FROM projects WHERE id = ?1 AND org = ?2')
    .bind(projectId, org)
    .run()
  if (!result.meta.changes) return fail('not_found', 'No such project.', 404)
  return ok({ deleted: projectId })
}

/**
 * A repository-scoped clone credential for a runner.
 *
 * Minted per job and never stored. The runner receives a token that can reach
 * exactly one repository for one hour — not the whole installation, and nothing
 * that survives the run.
 */
export async function cloneToken(env: Env, org: string, slug: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT p.slug, p.default_branch, i.external_id, i.revoked_at
     FROM projects p JOIN integrations i ON i.id = p.integration_id
     WHERE p.org = ?1 AND p.slug = ?2 AND p.status = 'active'`,
  )
    .bind(org, slug)
    .first<{ slug: string; default_branch: string; external_id: string; revoked_at: string | null }>()

  if (!row) return fail('not_found', `No active project "${slug}".`, 404)
  if (row.revoked_at) {
    return fail('integration_revoked', 'The GitHub App was uninstalled for this project.', 409)
  }

  const [owner, repo] = slug.split('__')
  if (!owner || !repo) return fail('invalid_slug', 'Project slug is malformed.', 500)

  try {
    const { token, expiresAt } = await installationToken(env, row.external_id, [repo])
    return ok({
      // Both shapes, because the runner needs both: `token` feeds a git credential
      // helper and gh's GH_TOKEN, where nothing is written to disk; `remote` is
      // the one-shot fallback for a git old enough to lack useHttpPath.
      token,
      // x-access-token is GitHub's documented username for App tokens over HTTPS.
      remote: `https://x-access-token:${token}@github.com/${owner}/${repo}.git`,
      defaultBranch: row.default_branch,
      expiresAt,
    })
  } catch (error) {
    return fail(
      'github_error',
      error instanceof Error ? error.message : 'Could not mint a clone token.',
      502,
    )
  }
}

/**
 * Open a pull request on the runner's behalf.
 *
 * The runner can already do this with `gh` when a human logged it in, so this is
 * the path for a runner that has only ever held short-lived App tokens: the
 * control plane holds the App key, so it is the one thing guaranteed to be able
 * to open the PR a run ends with.
 */
export async function runnerPullRequest(
  request: Request,
  env: Env,
  org: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    project?: string
    title?: string
    body?: string
    head?: string
    base?: string
  } | null

  if (!body?.project || !body.title || !body.head || !body.base) {
    return fail('invalid_input', 'project, title, head and base are required.')
  }

  const row = await env.DB.prepare(
    `SELECT p.slug, i.external_id, i.revoked_at
     FROM projects p JOIN integrations i ON i.id = p.integration_id
     WHERE p.org = ?1 AND p.slug = ?2`,
  )
    .bind(org, body.project)
    .first<{ slug: string; external_id: string; revoked_at: string | null }>()

  if (!row) return fail('not_found', `No project "${body.project}".`, 404)
  if (row.revoked_at) return fail('integration_revoked', 'The GitHub App was uninstalled.', 409)

  const fullName = row.slug.replace('__', '/')
  const url = await createPullRequest(env, row.external_id, fullName, {
    title: body.title,
    body: body.body ?? '',
    head: body.head,
    base: body.base,
  })
  if (!url) return fail('github_error', 'GitHub declined to open the pull request.', 502)
  return ok({ url })
}

/**
 * The GitHub webhook.
 *
 * Unauthenticated by necessity, so the HMAC signature is the authentication and
 * the body is not parsed until it verifies.
 */
export async function githubWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_WEBHOOK_SECRET) {
    return fail('not_configured', 'GITHUB_WEBHOOK_SECRET is not set.', 503)
  }

  const raw = await request.text()
  const valid = await verifyWebhook(
    env.GITHUB_WEBHOOK_SECRET,
    raw,
    request.headers.get('x-hub-signature-256'),
  )
  if (!valid) return fail('bad_signature', 'Signature verification failed.', 400)

  let event: {
    action?: string
    installation?: { id?: number; account?: { login?: string; type?: string } }
    // Present on the install callback we initiate, carrying the org.
    state?: string
  }
  try {
    event = JSON.parse(raw) as typeof event
  } catch {
    return fail('invalid_json', 'Body is not JSON.', 400)
  }

  const type = request.headers.get('x-github-event') ?? ''
  const installationId = event.installation?.id ? String(event.installation.id) : null
  if (!installationId) return ok({ ignored: type })

  switch (`${type}.${event.action ?? ''}`) {
    case 'installation.created': {
      // The org comes from `state`, which we set on the install URL. Without it
      // the installation cannot be attributed, so it waits for the callback.
      const org = typeof event.state === 'string' ? event.state : null
      if (!org) return ok({ pending: 'awaiting callback to attribute the installation' })

      const allowance = await canAddIntegration(env, org)
      if (!allowance.allowed) return limitResponse(allowance)

      await upsertIntegration(env, org, installationId, event.installation?.account)
      break
    }

    case 'installation.deleted':
    case 'installation.suspend': {
      // Mark rather than delete, so projects can explain why they stopped.
      await env.DB.prepare(
        'UPDATE integrations SET revoked_at = ?1 WHERE external_id = ?2 AND revoked_at IS NULL',
      )
        .bind(nowIso(), installationId)
        .run()
      await env.DB.prepare(
        `UPDATE projects SET status = 'inactive'
         WHERE integration_id IN (SELECT id FROM integrations WHERE external_id = ?1)`,
      )
        .bind(installationId)
        .run()
      break
    }

    case 'installation.unsuspend': {
      await env.DB.prepare(
        'UPDATE integrations SET revoked_at = NULL WHERE external_id = ?1',
      )
        .bind(installationId)
        .run()
      await env.DB.prepare(
        `UPDATE projects SET status = 'active'
         WHERE integration_id IN (SELECT id FROM integrations WHERE external_id = ?1)`,
      )
        .bind(installationId)
        .run()
      break
    }

    case 'installation_repositories.removed': {
      // A repo was deselected: its project can no longer be cloned.
      const removed = (JSON.parse(raw) as {
        repositories_removed?: Array<{ id: number }>
      }).repositories_removed ?? []
      for (const repo of removed) {
        await env.DB.prepare(
          `UPDATE projects SET status = 'inactive' WHERE external_id = ?1`,
        )
          .bind(String(repo.id))
          .run()
      }
      break
    }

    default:
      break
  }

  return ok({ received: `${type}.${event.action ?? ''}` })
}

async function upsertIntegration(
  env: Env,
  org: string,
  installationId: string,
  account?: { login?: string; type?: string },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO integrations
       (id, org, provider, external_id, account_login, account_type, created_at)
     VALUES (?1, ?2, 'github', ?3, ?4, ?5, ?6)
     ON CONFLICT (provider, external_id) DO UPDATE SET
       org = excluded.org,
       account_login = excluded.account_login,
       revoked_at = NULL`,
  )
    .bind(
      id('itg'), org, installationId,
      account?.login ?? null, account?.type ?? null, nowIso(),
    )
    .run()
}

/**
 * The redirect GitHub sends the user back to after installing.
 *
 * This is what attributes an installation to an org: `state` is the org we put
 * on the install URL, and `installation_id` is what GitHub appends.
 */
export async function githubCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const installationId = url.searchParams.get('installation_id')
  const org = url.searchParams.get('state')

  if (!installationId || !org) {
    return fail('invalid_callback', 'Missing installation_id or state.')
  }

  const allowance = await canAddIntegration(env, org)
  if (!allowance.allowed) return limitResponse(allowance)

  await upsertIntegration(env, org, installationId)

  // Straight back to the dashboard; it will now list the integration.
  const to = env.DASHBOARD_ORIGIN || '/'
  return new Response(null, { status: 302, headers: { location: `${to}?connected=github` } })
}
