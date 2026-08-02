import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { run, which } from '../core/exec.ts'
import { readConfig } from '../core/config.ts'
import { projectPaths, paths } from '../core/paths.ts'
import { Repo } from './git.ts'
import { readConventions } from '../components/workspace.ts'
import { parseClaudeCost, type RunBudget } from './spend.ts'

const MAX_DIFF_LINES = 3000

/**
 * The second opinion. aider writes the code; Claude Code reviews the accumulated
 * diff for correctness and security every few iterations and after any failure.
 *
 * Advisory by construction — it returns notes for the next prompt and never
 * fails the loop.
 */
export async function runVerification(
  cwd: string,
  reason: string,
  budget?: RunBudget,
): Promise<string> {
  const findings = await review(cwd, reason, budget)
  if (!findings) return ''

  return `A reviewer looked at your recent commits and found:\n${findings}\nAddress these before starting new work.`
}

export async function review(
  cwd: string,
  reason: string,
  budget?: RunBudget,
): Promise<string | null> {
  if (!(await which('claude'))) return null
  if (!process.env['ANTHROPIC_API_KEY']) return null

  const repo = new Repo(cwd)
  if (!(await repo.isRepo())) return null

  const cfg = readConfig()
  const lastVerifiedPath = join(cwd, projectPaths.lastVerified)

  let since: string | null = existsSync(lastVerifiedPath)
    ? readFileSync(lastVerifiedPath, 'utf8').trim()
    : null
  if (!since || !(await repo.refExists(since))) {
    since = await repo.firstCommit()
  }
  if (!since) return null

  let diff = await repo.diffSince(since)
  if (!diff.trim()) return null

  const lines = diff.split('\n')
  if (lines.length > MAX_DIFF_LINES) {
    diff = `${lines.slice(0, MAX_DIFF_LINES).join('\n')}\n… diff truncated at ${MAX_DIFF_LINES} of ${lines.length} lines`
  }

  const prompt = `You are reviewing commits written autonomously by an AI coding loop.
Trigger: ${reason}

Review the diff for:
1. Correctness bugs - logic errors, unhandled cases, broken state
2. Security - injection, secrets committed to source, unsafe file or network
   handling, missing authorization checks
3. Violations of the engineering conventions in your system prompt, especially
   checks weakened to force a green gate - deleted tests, loosened assertions,
   removed expected-label entries, added ts-ignore, widened types

Report ONLY specific, real problems you can point at. No style opinions, no
praise, no summary of what the code does. One finding per line, formatted:
- <file>: <the problem> -> <the fix>

If there is nothing worth reporting, output exactly: CLEAN

Diff:
${diff}`

  const args = [
    '-p', prompt,
    '--model', cfg.verifyModel,
    '--permission-mode', 'plan',
    '--allowedTools', 'Read,Grep,Glob',
    '--max-budget-usd', String(cfg.verifyBudgetUsd),
    '--output-format', 'json',
  ]

  // Hold the reviewer to the same contract the writer follows.
  const conventions = readConventions()
  const projectConventions = existsSync(join(cwd, projectPaths.conventions))
    ? readFileSync(join(cwd, projectPaths.conventions), 'utf8')
    : ''
  const combined = [conventions, projectConventions].filter(Boolean).join('\n\n')
  if (combined) {
    args.push(
      '--append-system-prompt',
      `These are the engineering conventions this repository is held to:\n${combined}`,
    )
  }

  const result = await run('claude', args, { cwd, timeoutMs: 300_000 })

  // Record what the review actually cost, not the cap it was allowed.
  const spent = parseClaudeCost(result.stdout)
  if (spent !== null) budget?.add('verify', spent)

  // Record the reviewed point regardless of outcome, so the next pass does not
  // re-review the same commits.
  const head = await repo.head()
  if (head) {
    mkdirSync(dirname(lastVerifiedPath), { recursive: true })
    writeFileSync(lastVerifiedPath, head)
  }

  let output = result.stdout.trim()
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>
    const text = parsed['result'] ?? parsed['text']
    if (typeof text === 'string') output = text.trim()
  } catch {
    /* plain text output from an older CLI — use it as-is */
  }

  if (!output) return null
  if (output.split('\n').some((l) => l.trim() === 'CLEAN')) return null
  return output
}

export function logsDir(): string {
  return paths.logs
}
