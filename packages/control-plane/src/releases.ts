import { type Env, fail, ok, id, nowIso } from './env.ts'
import { findOpenPull, mergePull } from './integrations/github.ts'
import { open } from './secrets.ts'

/**
 * Gate 2: "should this go to users now?"
 *
 * Gate 1 is merging a run's PR — "this code is correct" — and happens on
 * GitHub, next to the diff. Gate 2 belongs to whoever owns the product, who
 * should be able to decide from a changelog, screenshots and an installable
 * build, without reading a diff. The project's Changesets workflow already
 * keeps a "version packages" PR open with the changelog; approving the report
 * merges it, and the release workflow does the rest.
 */

interface ProjectRow {
  id: string
  slug: string
  default_branch: string
  installation_id: string
}

async function project(env: Env, org: string, projectId: string): Promise<ProjectRow | null> {
  return env.DB.prepare(
    `SELECT p.id, p.slug, p.default_branch, i.external_id AS installation_id
     FROM projects p JOIN integrations i ON i.id = p.integration_id
     WHERE p.id = ?1 AND p.org = ?2 AND i.revoked_at IS NULL`,
  )
    .bind(projectId, org)
    .first<ProjectRow>()
}

/** The branch changesets/action keeps its version PR on. */
export const versionBranch = (base: string) => `changeset-release/${base}`

interface DevBuild {
  status: string
  startedAt: string | null
  artifacts: Array<{ name: string; url: string }>
}

/**
 * The newest Codemagic dev-client build, for the reviewer to install. Needs the
 * project secrets CODEMAGIC_API_TOKEN and CODEMAGIC_APP_ID; absent, the report
 * simply has no build to offer.
 */
async function latestDevBuild(env: Env, org: string, projectId: string): Promise<DevBuild | null> {
  const rows = await env.DB.prepare(
    `SELECT name, ciphertext, iv FROM secrets
     WHERE org = ?1 AND scope = 'project' AND project_id = ?2 AND name IN ('CODEMAGIC_API_TOKEN', 'CODEMAGIC_APP_ID')`,
  )
    .bind(org, projectId)
    .all<{ name: string; ciphertext: string; iv: string }>()
  const values: Record<string, string> = {}
  for (const row of rows.results ?? []) {
    try {
      values[row.name] = await open(env, { org, scope: 'project', projectId, name: row.name }, row)
    } catch {
      return null
    }
  }
  if (!values['CODEMAGIC_API_TOKEN'] || !values['CODEMAGIC_APP_ID']) return null

  try {
    const res = await fetch(
      `https://api.codemagic.io/builds?appId=${encodeURIComponent(values['CODEMAGIC_APP_ID'])}&workflowId=dev-client`,
      { headers: { 'x-auth-token': values['CODEMAGIC_API_TOKEN'] } },
    )
    if (!res.ok) return null
    const body = (await res.json()) as {
      builds?: Array<{ status?: string; startedAt?: string; artefacts?: Array<{ name?: string; url?: string }> }>
    }
    const build = body.builds?.[0]
    if (!build) return null
    return {
      status: build.status ?? 'unknown',
      startedAt: build.startedAt ?? null,
      artifacts: (build.artefacts ?? []).flatMap((a) => (a.url ? [{ name: a.name ?? 'artifact', url: a.url }] : [])),
    }
  } catch {
    return null
  }
}

export async function releaseReport(env: Env, org: string, projectId: string): Promise<Response> {
  const row = await project(env, org, projectId)
  if (!row) return fail('not_found', 'No such project, or its GitHub connection is gone.', 404)
  const fullName = row.slug.replace('__', '/')

  const last = await env.DB.prepare(
    'SELECT approved_at, pr_url, title FROM releases WHERE project_id = ?1 ORDER BY approved_at DESC LIMIT 1',
  )
    .bind(projectId)
    .first<{ approved_at: string; pr_url: string; title: string | null }>()

  // What went in since the last release: runs whose PR was merged.
  const runs = await env.DB.prepare(
    `SELECT id, branch, pr_url, finished_at, cost_usd, commits, screenshots FROM runs
     WHERE org = ?1 AND project_slug = ?2 AND pr_state = 'merged' AND finished_at >= ?3
     ORDER BY finished_at DESC LIMIT 50`,
  )
    .bind(org, row.slug, last?.approved_at ?? '1970-01-01T00:00:00.000Z')
    .all<Record<string, unknown> & { screenshots: string | null; cost_usd: number }>()
  const merged = (runs.results ?? []).map((r) => {
    let screenshots: string[] = []
    try {
      screenshots = r.screenshots ? (JSON.parse(r.screenshots) as string[]) : []
    } catch {
      screenshots = []
    }
    return { ...r, screenshots }
  })

  const pr = await findOpenPull(env, row.installation_id, fullName, versionBranch(row.default_branch), row.default_branch)
    .catch(() => null)

  return ok({
    pending: pr,
    lastRelease: last ?? null,
    runs: merged,
    costUsd: merged.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0),
    devBuild: await latestDevBuild(env, org, projectId),
  })
}

/** Approving the report merges the version PR; the project's release workflow ships it. */
export async function approveRelease(env: Env, org: string, userId: string, projectId: string): Promise<Response> {
  const row = await project(env, org, projectId)
  if (!row) return fail('not_found', 'No such project, or its GitHub connection is gone.', 404)
  const fullName = row.slug.replace('__', '/')

  const pr = await findOpenPull(env, row.installation_id, fullName, versionBranch(row.default_branch), row.default_branch)
  if (!pr) return fail('nothing_to_release', 'There is no open version PR — nothing has changed since the last release.', 409)

  const merged = await mergePull(env, row.installation_id, fullName, pr.number)
  if (!merged.ok) return fail('merge_refused', `GitHub refused to merge ${pr.url}: ${merged.reason}`, 409)

  await env.DB.prepare(
    `INSERT INTO releases (id, org, project_id, pr_number, pr_url, title, merged_sha, approved_by, approved_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(id('rel'), org, projectId, pr.number, pr.url, pr.title, merged.sha, userId, nowIso())
    .run()
  return ok({ released: pr.url, sha: merged.sha })
}

/**
 * `pull_request` webhook: keep each run's PR state current, and treat a merged
 * plan PR as the approval landing on the default branch.
 */
export async function pullRequestEvent(
  env: Env,
  installationId: string,
  event: { action?: string; pull_request?: { html_url?: string; merged?: boolean; base?: { ref?: string } } },
  notifyPrd: (org: string, slug: string) => Promise<void>,
): Promise<void> {
  const url = event.pull_request?.html_url
  if (!url) return
  const state =
    event.action === 'closed' ? (event.pull_request?.merged ? 'merged' : 'closed')
    : event.action === 'opened' || event.action === 'reopened' ? 'open'
    : null
  if (!state) return

  // Scoped to the installation's org, so one tenant's webhook cannot touch another's rows.
  const integration = await env.DB.prepare(
    `SELECT org FROM integrations WHERE provider = 'github' AND external_id = ?1 AND revoked_at IS NULL`,
  )
    .bind(installationId)
    .first<{ org: string }>()
  if (!integration) return

  await env.DB.prepare('UPDATE runs SET pr_state = ?1 WHERE org = ?2 AND pr_url = ?3')
    .bind(state, integration.org, url)
    .run()

  if (state === 'merged') {
    const plan = await env.DB.prepare(
      `SELECT p.slug FROM plans pl JOIN projects p ON p.id = pl.project_id
       WHERE pl.org = ?1 AND pl.pr_url = ?2 AND pl.status = 'approved'`,
    )
      .bind(integration.org, url)
      .first<{ slug: string }>()
    if (plan) await notifyPrd(integration.org, plan.slug)
  }
}
