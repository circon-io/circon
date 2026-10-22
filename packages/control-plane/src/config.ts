/**
 * Run configuration as the dashboard edits it and the runner receives it.
 *
 * Layered, lowest to highest precedence:
 *
 *   CLI defaults < runner's local config.json < org < runner < project
 *
 * The control plane resolves org, runner and project at claim time and ships the
 * result in the job, so a run is configured once, at its start, by one snapshot.
 * Only keys that are actually set override, so an org default never clobbers a
 * value a more specific layer chose.
 */

export type IosRunnerMode = 'none' | 'simulator' | 'device'
export type AgentBackend = 'aider' | 'claude-code' | 'codex'
export type AgentRole = 'plan' | 'build' | 'review'

export interface RoleSpec {
  backend: AgentBackend
  /** Backend-specific model name, e.g. `opus`, `gpt-5-codex`, `sonnet`. */
  model?: string
  /** aider only: the cheap model that applies the architect's edits. */
  editorModel?: string
}

export interface RunConfig {
  /** 0 means no limit. */
  budgetPerRunUsd?: number
  budgetPerDayUsd?: number
  verifyEvery?: number
  verifyBudgetUsd?: number
  iosRunnerMode?: IosRunnerMode
  /** Gate tiers this runner or project must not run, e.g. a runner with no KVM. */
  skipTiers?: string[]
  /** `plan: null` explicitly turns a planning step inherited from a lower layer off. */
  agents?: Partial<Record<AgentRole, RoleSpec | null>>
}

const TIERS = ['typecheck', 'unit tests', 'web UI', 'android UI', 'ios UI']
const BACKENDS: AgentBackend[] = ['aider', 'claude-code', 'codex']
const ROLES: AgentRole[] = ['plan', 'build', 'review']
const MODEL = /^[\w.:/@-]{1,80}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function number(
  errors: string[],
  key: string,
  value: unknown,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean },
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max ||
    (integer && !Number.isInteger(value))) {
    errors.push(`${key} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`)
    return undefined
  }
  return value
}

function roleSpec(errors: string[], key: string, value: unknown): RoleSpec | null | undefined {
  if (value === null) return null
  if (!isRecord(value)) {
    errors.push(`${key} must be an object with a backend`)
    return undefined
  }
  const backend = value['backend']
  if (typeof backend !== 'string' || !BACKENDS.includes(backend as AgentBackend)) {
    errors.push(`${key}.backend must be one of ${BACKENDS.join(', ')}`)
    return undefined
  }
  const spec: RoleSpec = { backend: backend as AgentBackend }
  for (const field of ['model', 'editorModel'] as const) {
    const v = value[field]
    if (v === undefined || v === '') continue
    if (typeof v !== 'string' || !MODEL.test(v)) {
      errors.push(`${key}.${field} is not a valid model name`)
      continue
    }
    spec[field] = v
  }
  for (const extra of Object.keys(value)) {
    if (!['backend', 'model', 'editorModel'].includes(extra)) errors.push(`${key}.${extra} is not a setting`)
  }
  return spec
}

/**
 * Keep only known settings with valid values. Everything rejected is named, so
 * the dashboard can show exactly which field is wrong instead of "invalid".
 */
export function sanitizeConfig(input: unknown): { config: RunConfig; errors: string[] } {
  const errors: string[] = []
  const config: RunConfig = {}
  if (!isRecord(input)) return { config, errors: ['config must be an object'] }

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    switch (key) {
      case 'budgetPerRunUsd':
      case 'budgetPerDayUsd':
      case 'verifyBudgetUsd': {
        const n = number(errors, key, value, { min: 0, max: 10_000 })
        if (n !== undefined) config[key] = n
        break
      }
      case 'verifyEvery': {
        const n = number(errors, key, value, { min: 1, max: 100, integer: true })
        if (n !== undefined) config.verifyEvery = n
        break
      }
      case 'iosRunnerMode':
        if (value === 'none' || value === 'simulator' || value === 'device') config.iosRunnerMode = value
        else errors.push('iosRunnerMode must be none, simulator or device')
        break
      case 'skipTiers':
        if (Array.isArray(value) && value.every((t) => typeof t === 'string' && TIERS.includes(t))) {
          config.skipTiers = [...new Set(value as string[])]
        } else {
          errors.push(`skipTiers must only contain ${TIERS.join(', ')}`)
        }
        break
      case 'agents': {
        if (!isRecord(value)) {
          errors.push('agents must be an object keyed by role')
          break
        }
        const agents: NonNullable<RunConfig['agents']> = {}
        for (const [role, spec] of Object.entries(value)) {
          if (!ROLES.includes(role as AgentRole)) {
            errors.push(`agents.${role} is not a role (use ${ROLES.join(', ')})`)
            continue
          }
          if (spec === undefined) continue
          if (spec === null && role !== 'plan') {
            errors.push(`agents.${role} cannot be turned off`)
            continue
          }
          const parsed = roleSpec(errors, `agents.${role}`, spec)
          if (parsed !== undefined) agents[role as AgentRole] = parsed
        }
        if (Object.keys(agents).length) config.agents = agents
        break
      }
      default:
        errors.push(`${key} is not a setting`)
    }
  }
  return { config, errors }
}

/** Later layers win, key by key; agents merge role by role. */
export function mergeConfigs(...layers: Array<RunConfig | null | undefined>): RunConfig {
  const out: RunConfig = {}
  for (const layer of layers) {
    if (!layer) continue
    const { agents, ...rest } = layer
    Object.assign(out, rest)
    if (agents) out.agents = { ...(out.agents ?? {}), ...agents }
  }
  return out
}

/** Stored config is ours, but re-validated on read so one bad row cannot break a claim. */
export function parseStoredConfig(raw: string | null | undefined): RunConfig {
  if (!raw) return {}
  try {
    return sanitizeConfig(JSON.parse(raw)).config
  } catch {
    return {}
  }
}
