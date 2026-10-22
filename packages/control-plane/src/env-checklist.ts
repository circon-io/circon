import { type Env, fail, ok } from './env.ts'
import { readFile } from './integrations/github.ts'

/**
 * The keys a project still needs, before anyone finds out mid-run.
 *
 * Two sources, merged by name. `.env.example` on the default branch is the
 * truth once the project is scaffolded: every variable the code reads, with a
 * comment saying where to get it. Before that, the approved plan's "External
 * services" section names what the product will need, so the owner can gather
 * keys while the agent builds. Each name is checked against the stored secrets.
 *
 * The build never waits on this list — the conventions require a dev key, an
 * emulator or a stub for every service — so it is advice, not a gate.
 */

export interface EnvVar {
  name: string
  /** The comment above it: where to get the value. */
  help: string
  /** The `# --- Section ---` it sits under. */
  group: string | null
  /** A value in the example works locally (a localhost URL, a file database). */
  hasDefault: boolean
}

const VARIABLE = /^([A-Z][A-Z0-9_]*)=(.*)$/
const SECTION = /^#\s*-{2,}\s*(.+?)\s*-*\s*$/

export function parseEnvExample(text: string): EnvVar[] {
  const vars: EnvVar[] = []
  let group: string | null = null
  let comment: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      comment = []
      continue
    }
    const section = SECTION.exec(line)
    if (section) {
      group = section[1] ?? null
      comment = []
      continue
    }
    if (line.startsWith('#')) {
      comment.push(line.replace(/^#\s?/, ''))
      continue
    }
    const v = VARIABLE.exec(line)
    if (!v?.[1]) continue
    // A comment stays in force for the variables directly below it.
    vars.push({ name: v[1], help: comment.join(' '), group, hasDefault: (v[2] ?? '').trim().length > 0 })
  }
  return vars
}

const SERVICE_LINE = /^[-*]\s+`?([A-Z][A-Z0-9_]*)`?\s*(?:[—–:-]+\s*(.*))?$/

/** "- NAME — what for; where to get it" lines under `## External services`. */
export function parseExternalServices(prd: string): Array<{ name: string; help: string }> {
  const out: Array<{ name: string; help: string }> = []
  let inSection = false
  for (const line of prd.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)
    if (heading) {
      inSection = heading[1]?.toLowerCase() === 'external services'
      continue
    }
    if (!inSection) continue
    const m = SERVICE_LINE.exec(line.trim())
    if (m?.[1]) out.push({ name: m[1], help: (m[2] ?? '').trim() })
  }
  return out
}

export type ItemStatus = 'set' | 'default' | 'missing'

export interface ChecklistItem {
  name: string
  help: string
  group: string | null
  status: ItemStatus
  /** Where the name came from. */
  source: 'env-example' | 'plan'
}

export function buildChecklist(
  example: EnvVar[] | null,
  planned: Array<{ name: string; help: string }>,
  stored: Set<string>,
): ChecklistItem[] {
  const items = new Map<string, ChecklistItem>()
  for (const v of example ?? []) {
    items.set(v.name, {
      name: v.name,
      help: v.help,
      group: v.group,
      status: stored.has(v.name) ? 'set' : v.hasDefault ? 'default' : 'missing',
      source: 'env-example',
    })
  }
  for (const p of planned) {
    const existing = items.get(p.name)
    if (existing) {
      // The plan says why the product needs it; the example only where it comes from.
      if (p.help && !existing.help.includes(p.help)) existing.help = existing.help ? `${p.help}. ${existing.help}` : p.help
      continue
    }
    items.set(p.name, { name: p.name, help: p.help, group: 'From the plan', status: stored.has(p.name) ? 'set' : 'missing', source: 'plan' })
  }
  return [...items.values()]
}

export async function envChecklist(env: Env, org: string, projectId: string): Promise<Response> {
  const project = await env.DB.prepare(
    `SELECT p.id, p.slug, p.default_branch, i.external_id AS installation_id, i.revoked_at
     FROM projects p JOIN integrations i ON i.id = p.integration_id
     WHERE p.id = ?1 AND p.org = ?2`,
  )
    .bind(projectId, org)
    .first<{ id: string; slug: string; default_branch: string | null; installation_id: string; revoked_at: string | null }>()
  if (!project) return fail('not_found', 'No such project.', 404)

  let example: EnvVar[] | null = null
  let readError: string | null = null
  if (!project.revoked_at) {
    try {
      const text = await readFile(env, project.installation_id, project.slug.replace('__', '/'), '.env.example', project.default_branch ?? 'main')
      example = text === null ? null : parseEnvExample(text)
    } catch (e) {
      readError = e instanceof Error ? e.message : String(e)
    }
  }

  const plan = await env.DB.prepare(
    `SELECT prd FROM plans WHERE project_id = ?1 AND org = ?2
     ORDER BY CASE status WHEN 'approved' THEN 0 ELSE 1 END, version DESC LIMIT 1`,
  )
    .bind(projectId, org)
    .first<{ prd: string }>()

  const secrets = await env.DB.prepare(
    `SELECT name FROM secrets WHERE org = ?1 AND (scope = 'machine' OR (scope = 'project' AND project_id = ?2))`,
  )
    .bind(org, projectId)
    .all<{ name: string }>()
  const stored = new Set((secrets.results ?? []).map((r) => r.name))

  const items = buildChecklist(example, plan ? parseExternalServices(plan.prd) : [], stored)
  return ok({
    items,
    foundEnvExample: example !== null,
    readError,
    missing: items.filter((i) => i.status === 'missing').length,
  })
}
