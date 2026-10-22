import { run, which } from '../../core/exec.ts'
import { detectUsageLimit } from './limits.ts'
import type { AgentBackend, AgentRequest, AgentResult, Availability, Billing, Exec } from './types.ts'

/**
 * Claude Code in print mode (`claude -p`).
 *
 * Billing is the subtle part. In `-p` mode an `ANTHROPIC_API_KEY` in the
 * environment is always used when present, so a machine with both a key (aider
 * needs one) and a subscription would silently bill the API. When subscription
 * credentials exist, the key is removed from Claude's environment so the
 * subscription is what pays.
 */

export const CLAUDE_DEFAULT_MODEL = 'sonnet'
const API_KEY_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']

/** Tools for building: edit the tree and run the project's own scripts. */
const BUILD_TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash(pnpm *)', 'Bash(npm *)', 'Bash(npx *)', 'Bash(node *)',
  'Bash(ls *)', 'Bash(git status *)', 'Bash(git diff *)', 'Bash(git log *)',
]
/**
 * The loop owns history: it commits only what passed the gate, and reverts the
 * rest with `reset --hard`. An agent that committed or pushed on its own would
 * put unchecked work beyond that reset.
 */
const NEVER = ['Bash(git commit *)', 'Bash(git push *)', 'Bash(git reset *)', 'Bash(git checkout *)', 'Bash(rm -rf *)']
const READ_TOOLS = ['Read', 'Glob', 'Grep', 'Bash(git diff *)', 'Bash(git log *)', 'Bash(git show *)']

function base(req: AgentRequest, mode: string, tools: string[]): string[] {
  const args = [
    '-p', req.prompt,
    '--model', req.spec.model ?? CLAUDE_DEFAULT_MODEL,
    '--output-format', 'json',
    // `default` denies every tool not allowed below, which is exactly read-only
    // for plan and review; build widens it to file edits.
    '--permission-mode', mode,
  ]
  if (req.conventions) {
    args.push('--append-system-prompt', `These are the engineering conventions this repository is held to:\n${req.conventions}`)
  }
  if (req.budgetUsd && req.budgetUsd > 0) args.push('--max-budget-usd', String(req.budgetUsd))
  // Variadic, so last: nothing after it can be mistaken for a tool rule.
  args.push('--allowedTools', ...tools)
  return args
}

export function claudeBuildArgs(req: AgentRequest): string[] {
  const args = base(req, 'acceptEdits', BUILD_TOOLS)
  return ['--disallowedTools', ...NEVER, '--max-turns', '80', ...args]
}

export function claudeReadOnlyArgs(req: AgentRequest): string[] {
  return ['--max-turns', '30', ...base(req, 'default', READ_TOOLS)]
}

export interface ClaudeJson {
  result?: string
  total_cost_usd?: number
  cost_usd?: number
  subtype?: string
  is_error?: boolean
}

export function parseClaudeOutput(stdout: string): ClaudeJson | null {
  const trimmed = stdout.trim()
  // Some versions print a warning line before the JSON object.
  const start = trimmed.indexOf('{')
  if (start < 0) return null
  try {
    return JSON.parse(trimmed.slice(start)) as ClaudeJson
  } catch {
    return null
  }
}

export function claudeCodeBackend(exec: Exec = run): AgentBackend {
  let billing: Promise<Billing | null> | null = null

  /** Which credentials Claude will use once API keys are out of the way, checked once. */
  const subscriptionAuth = (): Promise<Billing | null> => {
    billing ??= (async () => {
      if (process.env['CLAUDE_CODE_OAUTH_TOKEN']) return 'subscription'
      const status = await exec('claude', ['auth', 'status'], { unsetEnv: API_KEY_VARS, timeoutMs: 20_000 })
      const method = (() => {
        try {
          return (JSON.parse(status.stdout) as { authMethod?: string }).authMethod ?? null
        } catch {
          return null
        }
      })()
      return status.ok && (method === 'claude.ai' || method === 'oauth_token') ? 'subscription' : null
    })()
    return billing
  }

  const invoke = async (args: string[], req: AgentRequest, input?: string): Promise<AgentResult> => {
    const useSubscription = (await subscriptionAuth()) === 'subscription'
    const result = await exec('claude', args, {
      cwd: req.cwd,
      timeoutMs: 45 * 60_000,
      ...(useSubscription ? { unsetEnv: API_KEY_VARS } : {}),
      ...(input ? { input } : {}),
      ...(req.onOutput ? { onOutput: req.onOutput } : {}),
    })
    const output = result.stdout + result.stderr
    const parsed = parseClaudeOutput(result.stdout)
    const text = (parsed?.result ?? (parsed ? '' : result.stdout)).trim()
    const failed = !result.ok || parsed?.is_error === true || (parsed?.subtype !== undefined && parsed.subtype !== 'success')
    const limited = failed ? detectUsageLimit(`${output}\n${text}`) : null
    const cost = parsed?.total_cost_usd ?? parsed?.cost_usd
    return {
      ok: !failed,
      output,
      text,
      costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
      ...(limited ? { limited } : {}),
    }
  }

  return {
    id: 'claude-code',
    needsLocalModel: () => false,
    async available(): Promise<Availability> {
      if (!(await which('claude'))) {
        return { ok: false, billing: 'api', reason: "Claude Code is not installed — run 'circon setup'" }
      }
      if ((await subscriptionAuth()) === 'subscription') return { ok: true, billing: 'subscription' }
      if (process.env['ANTHROPIC_API_KEY']) return { ok: true, billing: 'api' }
      return {
        ok: false,
        billing: 'subscription',
        reason: "Claude Code is not logged in — run 'claude setup-token' and add it with 'circon config'",
      }
    },
    build: (req) => invoke(claudeBuildArgs(req), req),
    plan: (req) => invoke(claudeReadOnlyArgs(req), req),
    review: (req) => invoke(claudeReadOnlyArgs(req), req),
  }
}
