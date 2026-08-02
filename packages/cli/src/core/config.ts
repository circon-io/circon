import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths.ts'

/**
 * Two kinds of settings, deliberately separated:
 *
 *  - config.json  non-secret preferences, safe to read and print
 *  - *.env        credentials, written 0600, never logged
 */

export interface Config {
  conventionsRepo?: string
  /** Branch the agent commits to; your PRD edits stay on main. */
  workBranch?: string
  verifyEvery?: number
  verifyModel?: string
  verifyBudgetUsd?: number
  /** 0 means no limit. */
  budgetPerRunUsd?: number
  budgetPerDayUsd?: number
  reportHour?: number
  iosRunnerMode?: 'none' | 'mac' | 'device' | 'vm'
}

const DEFAULTS: Required<
  Pick<
    Config,
    | 'workBranch'
    | 'verifyEvery'
    | 'verifyModel'
    | 'verifyBudgetUsd'
    | 'budgetPerRunUsd'
    | 'budgetPerDayUsd'
    | 'iosRunnerMode'
  >
> = {
  workBranch: 'circon/work',
  verifyEvery: 5,
  verifyModel: 'sonnet',
  verifyBudgetUsd: 0.5,
  // Conservative defaults: a runaway loop is capped before it is noticed.
  budgetPerRunUsd: 10,
  budgetPerDayUsd: 40,
  iosRunnerMode: 'none',
}

const configFile = () => join(paths.config, 'config.json')

export function readConfig(): Config & typeof DEFAULTS {
  let stored: Config = {}
  if (existsSync(configFile())) {
    try {
      stored = JSON.parse(readFileSync(configFile(), 'utf8')) as Config
    } catch {
      // A malformed config must not brick the CLI; fall back to defaults.
      stored = {}
    }
  }
  return { ...DEFAULTS, ...stored }
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

export function hasCredentials(name: string, required: string[]): boolean {
  const env = readEnvFile(name)
  return required.every((key) => Boolean(env[key]))
}
