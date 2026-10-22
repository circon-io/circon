import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { effectiveConfig, type RoleSpec } from '../core/config.ts'
import { projectPaths, paths } from '../core/paths.ts'
import { Repo } from './git.ts'
import { readConventions } from '../components/workspace.ts'
import type { RunBudget } from './spend.ts'
import { realBackends, resolveRoles, type AgentBackend, type Billing } from './backends/index.ts'
import type { UsageLimit } from './backends/types.ts'

/** Diff text inlined into the prompt; the reviewer can read further with git itself. */
const MAX_DIFF_CHARS = 60_000

/** The conventions, as text and as files: what every agent call is held to. */
export function conventionsContext(cwd: string): { text: string; files: string[] } {
  const files: string[] = []
  const parts: string[] = []
  const shared = readConventions()
  if (shared) {
    files.push(join(paths.conventions, 'ARCHITECTURE.md'))
    parts.push(shared)
  }
  const local = join(cwd, projectPaths.conventions)
  if (existsSync(local)) {
    files.push(projectPaths.conventions)
    parts.push(readFileSync(local, 'utf8'))
  }
  return { text: parts.join('\n\n'), files }
}

export interface Reviewer {
  backend: AgentBackend
  spec: RoleSpec
  billing: Billing
  budget?: RunBudget
  budgetUsd?: number
  onOutput?: (chunk: string) => void
}

export interface ReviewOutcome {
  findings: string | null
  limited?: UsageLimit
}

/**
 * The second opinion. One agent writes the code; another reviews the
 * accumulated diff for correctness and security every few iterations and after
 * any failure — ideally a different vendor, so it does not share the writer's
 * blind spots.
 *
 * Advisory by construction — it returns notes for the next prompt and never
 * fails the loop.
 */
export async function review(cwd: string, reason: string, reviewer: Reviewer): Promise<ReviewOutcome> {
  const repo = new Repo(cwd)
  if (!(await repo.isRepo())) return { findings: null }

  const lastVerifiedPath = join(cwd, projectPaths.lastVerified)
  let since: string | null = existsSync(lastVerifiedPath)
    ? readFileSync(lastVerifiedPath, 'utf8').trim()
    : null
  if (!since || !(await repo.refExists(since))) since = await repo.firstCommit()
  if (!since) return { findings: null }

  let diff = await repo.diffSince(since)
  if (!diff.trim()) return { findings: null }
  if (diff.length > MAX_DIFF_CHARS) {
    diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n… diff truncated — run \`git diff ${since}..HEAD\` to read the rest`
  }

  const prompt = `You are reviewing commits written autonomously by an AI coding loop.
Trigger: ${reason}
Range: ${since}..HEAD

Review the diff for:
1. Correctness bugs - logic errors, unhandled cases, broken state
2. Security - injection, secrets committed to source, unsafe file or network
   handling, missing authorization checks
3. Violations of the engineering conventions, especially checks weakened to
   force a green gate - deleted tests, loosened assertions, removed
   expected-label entries, added ts-ignore, widened types
4. User-facing gaps visible in the code - a loading, empty or error state the
   screen does not handle, visible text outside i18n, an interactive element
   without an accessibilityLabel, UI built around packages/ui instead of with it

Report ONLY specific, real problems you can point at. No style opinions, no
praise, no summary of what the code does. One finding per line, formatted:
- <file>: <the problem> -> <the fix>

If there is nothing worth reporting, output exactly: CLEAN

Diff:
${diff}`

  const conventions = conventionsContext(cwd)
  const result = await reviewer.backend.review({
    cwd,
    prompt,
    since,
    conventions: conventions.text,
    conventionFiles: conventions.files,
    spec: reviewer.spec,
    ...(reviewer.budgetUsd ? { budgetUsd: reviewer.budgetUsd } : {}),
    ...(reviewer.onOutput ? { onOutput: reviewer.onOutput } : {}),
  })

  // Record what the review actually cost, not the cap it was allowed.
  if (result.costUsd !== null) {
    reviewer.budget?.add(`review:${reviewer.backend.id}`, result.costUsd, {
      notional: reviewer.billing === 'subscription',
    })
  }
  if (result.limited) return { findings: null, limited: result.limited }

  // Record the reviewed point regardless of outcome, so the next pass does not
  // re-review the same commits.
  const head = await repo.head()
  if (head) {
    mkdirSync(dirname(lastVerifiedPath), { recursive: true })
    writeFileSync(lastVerifiedPath, head)
  }

  const text = result.text.trim()
  if (!result.ok || !text) return { findings: null }
  if (text.split('\n').some((l) => l.trim() === 'CLEAN')) return { findings: null }
  return { findings: text }
}

/** Findings phrased as instructions for the agent's next prompt, or ''. */
export async function runVerification(cwd: string, reason: string, reviewer: Reviewer): Promise<string> {
  const { findings } = await review(cwd, reason, reviewer)
  if (!findings) return ''
  return `A reviewer looked at your recent commits and found:\n${findings}\nAddress these before starting new work.`
}

/** `circon verify` outside a run: the configured reviewer, if it can run here. */
export async function reviewerFromConfig(): Promise<Reviewer | { error: string }> {
  const cfg = effectiveConfig()
  const spec = resolveRoles(cfg).review
  const backend = realBackends()[spec.backend]
  const availability = await backend.available(spec)
  if (!availability.ok) return { error: availability.reason ?? `${spec.backend} is not available` }
  return { backend, spec, billing: availability.billing, budgetUsd: cfg.verifyBudgetUsd }
}
