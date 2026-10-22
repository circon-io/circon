import { type Env, ok } from './env.ts'
import { historyCutoff } from './billing/entitlements.ts'

/**
 * What got built, across every runner, in a window — the daily report.
 *
 * It used to be a systemd timer on each machine that printed one machine's git
 * log into the journal at 20:00, which nobody read, which needed that machine
 * awake, and which did not exist on macOS. Every runner already reports its
 * runs here, with the subjects of its commits, and those subjects are the PRD
 * task names, so the fleet-wide answer to "what happened today?" is a query.
 */

/** Commits that record bookkeeping rather than work. */
const BOOKKEEPING = /^chore: (record |screenshots for review$|sync prd$|iteration \d+$)/
const CONVENTIONAL_PREFIX = /^(feat|fix|refactor|perf)(\([^)]*\))?!?:\s*/
const SHOWN_PER_PROJECT = 8

export interface ProjectDigest {
  slug: string
  runs: number
  outcomes: Record<string, number>
  costUsd: number
  /** What was built, newest first: task names from commit subjects. */
  built: string[]
  /** How many more there were than `built` shows. */
  moreBuilt: number
  pullRequests: Array<{ url: string; state: string | null }>
}

export function summarize(
  rows: Array<{ project_slug: string; outcome: string | null; cost_usd: number | null; commit_subjects: string | null; pr_url: string | null; pr_state: string | null }>,
): { projects: ProjectDigest[]; totals: { runs: number; built: number; costUsd: number } } {
  const byProject = new Map<string, ProjectDigest & { all: Set<string> }>()
  for (const row of rows) {
    let p = byProject.get(row.project_slug)
    if (!p) {
      p = { slug: row.project_slug, runs: 0, outcomes: {}, costUsd: 0, built: [], moreBuilt: 0, pullRequests: [], all: new Set() }
      byProject.set(row.project_slug, p)
    }
    p.runs++
    const outcome = row.outcome ?? 'running'
    p.outcomes[outcome] = (p.outcomes[outcome] ?? 0) + 1
    p.costUsd += row.cost_usd ?? 0
    if (row.pr_url) p.pullRequests.push({ url: row.pr_url, state: row.pr_state })
    let subjects: unknown = []
    try {
      subjects = row.commit_subjects ? JSON.parse(row.commit_subjects) : []
    } catch {
      subjects = []
    }
    for (const subject of Array.isArray(subjects) ? subjects : []) {
      if (typeof subject !== 'string' || BOOKKEEPING.test(subject)) continue
      p.all.add(subject.replace(CONVENTIONAL_PREFIX, ''))
    }
  }

  const projects = [...byProject.values()].map(({ all, ...p }) => {
    const built = [...all]
    return { ...p, costUsd: Math.round(p.costUsd * 100) / 100, built: built.slice(0, SHOWN_PER_PROJECT), moreBuilt: Math.max(0, built.length - SHOWN_PER_PROJECT) }
  })
  return {
    projects,
    totals: {
      runs: projects.reduce((n, p) => n + p.runs, 0),
      built: projects.reduce((n, p) => n + p.built.length + p.moreBuilt, 0),
      costUsd: Math.round(projects.reduce((n, p) => n + p.costUsd, 0) * 100) / 100,
    },
  }
}

export async function digest(env: Env, org: string, url: URL): Promise<Response> {
  const hours = Math.min(Math.max(Number.parseInt(url.searchParams.get('hours') ?? '24', 10) || 24, 1), 168)
  const window = new Date(Date.now() - hours * 3_600_000).toISOString()
  // The plan's history window still applies: a digest is not a way around it.
  const cutoff = await historyCutoff(env, org)
  const since = window > cutoff ? window : cutoff

  // A run counts if it started or finished inside the window, so a long run
  // that finished this morning is in today's digest.
  const rows = await env.DB.prepare(
    `SELECT project_slug, outcome, cost_usd, commit_subjects, pr_url, pr_state FROM runs
     WHERE org = ?1 AND (started_at >= ?2 OR finished_at >= ?2) AND started_at >= ?3
     ORDER BY started_at DESC LIMIT 500`,
  )
    .bind(org, since, cutoff)
    .all<{ project_slug: string; outcome: string | null; cost_usd: number | null; commit_subjects: string | null; pr_url: string | null; pr_state: string | null }>()

  return ok({ since, hours, ...summarize(rows.results ?? []) })
}
