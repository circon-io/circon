import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths.ts'

/**
 * Two kinds of settings, deliberately separated:
 *
 *  - config.json  non-secret preferences, safe to read and print
 *  - *.env        credentials, written 0600, never logged
 */

export type IosRunnerMode = 'none' | 'simulator' | 'device'
export type AgentBackendId = 'aider' | 'claude-code' | 'codex'
export type AgentRole = 'plan' | 'build' | 'review' | 'audit'

export interface RoleSpec {
  backend: AgentBackendId
  model?: string
  /** aider only: the cheap model that applies the architect's edits. */
  editorModel?: string
}

/**
 * Settings that shape a run. The dashboard edits these too (org, runner and
 * project layers), so the shape matches the control plane's `RunConfig`.
 */
export interface RunConfig {
  /** 0 means no limit. */
  budgetPerRunUsd?: number
  budgetPerDayUsd?: number
  verifyEvery?: number
  verifyBudgetUsd?: number
  iosRunnerMode?: IosRunnerMode
  /** Gate tiers not to run here, e.g. on a runner without KVM. */
  skipTiers?: string[]
  /** `plan: null` or `audit: null` turns that step, inherited from a lower layer, off. */
  agents?: Partial<Record<AgentRole, RoleSpec | null>>
  /** Iterations spent on the design review's findings once the PRD is done. 0 is off. */
  polishIterations?: number
}

/** Machine-local settings: everything a run uses, plus what only this machine needs. */
export interface Config extends RunConfig {
  conventionsRepo?: string
  /** Model for the review pass. Superseded by `agents.review`, still honored. */
  verifyModel?: string
}

const DEFAULTS = {
  verifyEvery: 5,
  verifyModel: 'sonnet',
  verifyBudgetUsd: 0.5,
  // Conservative defaults: a runaway loop is capped before it is noticed.
  budgetPerRunUsd: 10,
  budgetPerDayUsd: 40,
  iosRunnerMode: 'none' as IosRunnerMode,
  skipTiers: [] as string[],
  // Polish costs money nobody approved in the plan, so it is opt-in.
  polishIterations: 0,
}

export type ResolvedConfig = Config & typeof DEFAULTS

const configFile = () => join(paths.config, 'config.json')

function readStored(): Config {
  if (!existsSync(configFile())) return {}
  try {
    const stored = JSON.parse(readFileSync(configFile(), 'utf8')) as Config & { iosRunnerMode?: string }
    // `mac` and `vm` were stubs that never worked; read them as off.
    if (stored.iosRunnerMode && !['none', 'simulator', 'device'].includes(stored.iosRunnerMode)) {
      stored.iosRunnerMode = 'none'
    }
    return stored as Config
  } catch {
    // A malformed config must not brick the CLI; fall back to defaults.
    return {}
  }
}

export function readConfig(): ResolvedConfig {
  return { ...DEFAULTS, ...readStored() }
}

/**
 * The config a run actually uses: defaults < local config.json < the control
 * plane's snapshot (org < runner < project, already merged server-side).
 *
 * Only keys a layer sets override, and agents merge role by role, so a project
 * that only picks a build model still inherits the org's reviewer.
 */
export function effectiveConfig(remote?: RunConfig | null, local: Config = readStored()): ResolvedConfig {
  const merged: ResolvedConfig = { ...DEFAULTS, ...local }
  if (!remote) return merged
  const { agents, ...rest } = remote
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) (merged as unknown as Record<string, unknown>)[key] = value
  }
  if (agents) merged.agents = { ...(local.agents ?? {}), ...agents }
  return merged
}

export function writeConfig(update: Config): void {
  mkdirSync(paths.config, { recursive: true })
  const merged = { ...readConfig(), ...update }
  writeFileSync(configFile(), `${JSON.stringify(merged, null, 2)}\n`)
}

/** Read a KEY="value" env file. Returns {} when absent. */
export function readEnvFile(name: string): Record<string, string> {
  const file = paths.credentials(name)
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/** Write a credentials file at 0600. Never echoed back to the terminal. */
export function writeEnvFile(name: string, values: Record<string, string>, header?: string): void {
  mkdirSync(paths.config, { recursive: true })
  const file = paths.credentials(name)
  const lines = [
    header ? `# ${header}` : `# circon credentials (${name})`,
    ...Object.entries(values).map(([k, v]) => `${k}="${v}"`),
    '',
  ]
  writeFileSync(file, lines.join('\n'), { mode: 0o600 })
  chmodSync(file, 0o600)
}

/**
 * Credential files the agent backends read from the environment. Project
 * credentials (Cloudflare, Clerk…) are deliberately absent: the agent process
 * must not hold a deploy token, and those are scoped per job instead.
 */
export const AGENT_CREDENTIALS = ['anthropic', 'openai'] as const

/**
 * Load credential files into `process.env` at startup. `circon config` writes
 * them, and without this a run only worked if the user's shell happened to
 * export the same keys. Variables already set win, so an explicit
 * `ANTHROPIC_API_KEY=… circon run` still overrides the file.
 */
export function loadCredentials(
  names: readonly string[] = AGENT_CREDENTIALS,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const loaded: string[] = []
  for (const name of names) {
    for (const [key, value] of Object.entries(readEnvFile(name))) {
      if (env[key] === undefined && value) {
        env[key] = value
        loaded.push(key)
      }
    }
  }
  return loaded
}

export function hasCredentials(name: string, required: string[]): boolean {
  const env = readEnvFile(name)
  return required.every((key) => Boolean(env[key]))
}
