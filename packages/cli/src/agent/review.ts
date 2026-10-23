import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { run, which } from '../core/exec.ts'
import { SHOT_DIR } from './screens.ts'
import type { Repo } from './git.ts'
import type { Task } from './progress.ts'
import { usd } from './spend.ts'

/**
 * Turning a finished run into something a human can decide on.
 *
 * The gate asserts on the accessibility tree because pixels are the wrong thing
 * to fail a build on. A reviewer deciding whether to ship wants to *see* it, so
 * the PR carries screenshots (see screens.ts), purely as a review artifact.
 */

export interface RunSummary {
  project: string
  branch: string
  iterations: number
  commits: string[]
  tasksCompleted: Task[]
  tasksOpen: Task[]
  notes: string
  gateTiers: string[]
  /** null when the pass did not run; [] when it ran and found nothing. */
  designFindings?: string[] | null
  auditFindings?: string[] | null
  costUsd: number
  logPath: string
  /** The run's page in the dashboard, when this runner is enrolled. */
  runUrl?: string
}

export function existingScreenshots(cwd: string): string[] {
  const dir = join(cwd, SHOT_DIR)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .slice(-6)
    .map((f) => join(SHOT_DIR, f))
}

/**
 * A committed screenshot as an image GitHub renders in a PR body, including for
 * a private repository when the reader has access to it.
 */
export function screenshotUrl(slug: string, branch: string, path: string): string {
  const [owner, repo] = slug.split('__')
  return `https://github.com/${owner}/${repo}/blob/${branch}/${path.split('\\').join('/')}?raw=true`
}

export function prBody(summary: RunSummary, screenshots: string[]): string {
  const lines: string[] = []

  lines.push(
    summary.runUrl
      ? `Opened automatically by \`circon run\` — [watch this run in the dashboard](${summary.runUrl}).`
      : 'Opened automatically by `circon run`.',
    '',
  )

  if (summary.tasksCompleted.length) {
    lines.push('## Tasks completed', '')
    for (const t of summary.tasksCompleted) lines.push(`- ${t.text}`)
    lines.push('')
  }

  if (summary.commits.length) {
    lines.push('## Commits', '')
    for (const c of summary.commits) lines.push(`- ${c}`)
    lines.push('')
  }

  if (summary.notes.trim()) {
    lines.push("## The agent's notes", '', '```', summary.notes.trim(), '```', '')
  }

  lines.push('## Gate', '')
  lines.push(
    summary.gateTiers.length
      ? `Passed: ${summary.gateTiers.join(' → ')}`
      : '_No gate tiers were configured for this project._',
  )
  lines.push('')

  if (screenshots.length) {
    lines.push('## Screenshots', '')
    lines.push('_Captured after the gate passed, for review only — the gate')
    lines.push('asserts on the accessibility tree, never on pixels._', '')
    for (const s of screenshots) lines.push(`![${s.split('/').pop()?.split('?')[0] ?? 'screenshot'}](${s})`)
    lines.push('')
  }

  if (summary.auditFindings) {
    lines.push('## Security audit', '')
    if (summary.auditFindings.length) {
      lines.push('_A whole-repository read once the plan was done. Advisory: decide before merging._', '')
      for (const f of summary.auditFindings) lines.push(`- ${f}`)
    } else {
      lines.push('Nothing found.')
    }
    lines.push('')
  }

  if (summary.designFindings?.length) {
    lines.push('## Design review', '')
    lines.push('_From the screenshots above. Advisory — the gate never fails on pixels._', '')
    for (const f of summary.designFindings) lines.push(`- ${f}`)
    lines.push('')
  }

  if (summary.tasksOpen.length) {
    lines.push('## Still open', '')
    for (const t of summary.tasksOpen.slice(0, 10)) lines.push(`- ${t.text}`)
    if (summary.tasksOpen.length > 10) {
      lines.push(`- … and ${summary.tasksOpen.length - 10} more`)
    }
    lines.push('')
  }

  lines.push('---', '')
  lines.push(
    `${summary.iterations} iterations · ${summary.commits.length} commits · ${usd(summary.costUsd)}`,
  )
  lines.push('')
  lines.push(`<sub>Log: \`${summary.logPath}\`</sub>`)

  return lines.join('\n')
}

export function prTitle(summary: RunSummary): string {
  const first = summary.tasksCompleted[0]?.text
  if (summary.tasksCompleted.length === 1 && first) return `feat: ${first}`
  if (first) return `feat: ${first} (+${summary.tasksCompleted.length - 1} more)`
  return `chore: ${summary.project} run ${summary.branch.split('-').at(-1) ?? ''}`.trim()
}

/**
 * Open the PR with `gh` when it is available and authenticated.
 *
 * Returns the URL, or null with the reason logged — a missing `gh` must not
 * fail a run whose work is already pushed.
 */
export async function openPullRequest(
  cwd: string,
  repo: Repo,
  summary: RunSummary,
  screenshots: string[],
  base: string,
  /**
   * A GitHub App installation token. When present, gh authenticates as the App
   * and no `gh auth login` is needed on the runner — which is the whole point of
   * enrolling one. Absent for a standalone runner, which uses its own gh login.
   */
  token?: string,
): Promise<{ url: string | null; reason?: string }> {
  if (!(await which('gh'))) {
    return { url: null, reason: 'gh CLI not installed' }
  }
  if (!(await repo.hasRemote())) {
    return { url: null, reason: 'no git remote' }
  }

  // GH_TOKEN wins over any stored login, so this must be passed to every gh
  // call below, not just the first.
  const env = token ? { GH_TOKEN: token, GITHUB_TOKEN: token } : undefined
  if (!token) {
    const auth = await run('gh', ['auth', 'status'], { cwd, timeoutMs: 15_000 })
    if (!auth.ok) return { url: null, reason: 'gh is not authenticated' }
  }

  const existing = await run(
    'gh',
    ['pr', 'list', '--head', summary.branch, '--json', 'url', '--jq', '.[0].url'],
    { cwd, timeoutMs: 30_000, ...(env ? { env } : {}) },
  )
  if (existing.ok && existing.stdout.trim()) {
    // Re-running against the same branch updates rather than duplicating.
    await run('gh', ['pr', 'edit', summary.branch, '--body', prBody(summary, screenshots)], {
      cwd,
      timeoutMs: 30_000,
      ...(env ? { env } : {}),
    })
    return { url: existing.stdout.trim() }
  }

  const created = await run(
    'gh',
    [
      'pr', 'create',
      '--base', base,
      '--head', summary.branch,
      '--title', prTitle(summary),
      '--body', prBody(summary, screenshots),
    ],
    { cwd, timeoutMs: 60_000, ...(env ? { env } : {}) },
  )

  if (!created.ok) {
    return { url: null, reason: created.stderr.trim().split('\n')[0] ?? 'gh pr create failed' }
  }
  const url = created.stdout.trim().split('\n').find((l) => l.startsWith('http'))
  return { url: url ?? null }
}
