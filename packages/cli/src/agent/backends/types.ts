import type { AgentBackendId, RoleSpec } from '../../core/config.ts'
import type { RunOptions as ExecOptions, RunResult } from '../../core/exec.ts'

/**
 * One coding agent the loop can drive: aider, Claude Code or Codex.
 *
 * The loop has three roles — plan (optional), build and review — and each can
 * be filled by a different backend and model. A backend only has to know how to
 * invoke its CLI for each role and how to read cost and limits back out; the
 * loop owns everything else (the gate, commits, the breaker, the budget).
 */

/** Who pays. `subscription` usage is notional and never counts against a cap. */
export type Billing = 'api' | 'subscription' | 'local'

export interface Availability {
  ok: boolean
  billing: Billing
  /** Why it cannot run, phrased as what to do about it. */
  reason?: string
}

export interface AgentRequest {
  cwd: string
  prompt: string
  /** The conventions, as text: appended to the system prompt where the CLI allows it. */
  conventions: string
  /** Paths (absolute or relative to cwd) of the files holding those conventions. */
  conventionFiles: string[]
  spec: RoleSpec
  onOutput?: (chunk: string) => void
  /** A hard cap on this one call, where the CLI supports one. */
  budgetUsd?: number
  /** Screenshots to look at, relative to cwd. Only sent to a backend with `vision`. */
  images?: string[]
}

export interface UsageLimit {
  /** When the limit lifts, if the CLI said. */
  resetAt: Date | null
  detail: string
}

export interface AgentResult {
  ok: boolean
  /** Everything the CLI printed, for the run log. */
  output: string
  /** The agent's final answer: the plan, or the review findings. */
  text: string
  /** Real or notional cost of this call; null when the CLI did not report one. */
  costUsd: number | null
  /** Set when the call stopped on a subscription or rate limit, not on the code. */
  limited?: UsageLimit
}

export interface AgentBackend {
  readonly id: AgentBackendId
  /** Whether it can look at images: what the design review needs. */
  readonly vision: boolean
  /** Whether this role spec needs Ollama on this machine. */
  needsLocalModel(spec: RoleSpec): boolean
  available(spec: RoleSpec): Promise<Availability>
  /** Make the change. Edits files; never commits — the loop commits what passes the gate. */
  build(req: AgentRequest): Promise<AgentResult>
  /** Read-only: decide how to do the task. The text feeds the build prompt. */
  plan(req: AgentRequest): Promise<AgentResult>
  /** Read-only: find real problems in the recent commits. */
  review(req: AgentRequest & { since: string }): Promise<AgentResult>
}

/** The command runner backends use, injectable so argument building is testable. */
export type Exec = (cmd: string, args: string[], opts?: ExecOptions) => Promise<RunResult>
