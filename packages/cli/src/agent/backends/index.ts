import type { AgentBackendId, AgentRole, ResolvedConfig, RoleSpec } from '../../core/config.ts'
import { aiderBackend, AIDER_DEFAULT_EDITOR, AIDER_DEFAULT_MODEL } from './aider.ts'
import { claudeCodeBackend } from './claude-code.ts'
import { codexBackend } from './codex.ts'
import type { AgentBackend } from './types.ts'

export type { AgentBackend, AgentRequest, AgentResult, Billing } from './types.ts'

export type Backends = Record<AgentBackendId, AgentBackend>

export function realBackends(): Backends {
  return {
    'aider': aiderBackend(),
    'claude-code': claudeCodeBackend(),
    'codex': codexBackend(),
  }
}

export interface Roles {
  plan: RoleSpec | null
  build: RoleSpec
  review: RoleSpec
}

/**
 * Who does what in this run.
 *
 * With nothing configured this is exactly the loop as it always was: aider
 * builds with Sonnet as architect and a local Qwen applying the edits, and
 * Claude Code reviews with `verifyModel`. No planning step.
 */
export function resolveRoles(cfg: ResolvedConfig): Roles {
  const agents = cfg.agents ?? {}
  return {
    plan: agents.plan ?? null,
    build: agents.build ?? { backend: 'aider', model: AIDER_DEFAULT_MODEL, editorModel: AIDER_DEFAULT_EDITOR },
    review: agents.review ?? { backend: 'claude-code', model: cfg.verifyModel },
  }
}

/** For the run record and the dashboard: which backend and model filled each role. */
export function describeRoles(roles: Roles): Partial<Record<AgentRole, { backend: string; model?: string }>> {
  const out: Partial<Record<AgentRole, { backend: string; model?: string }>> = {}
  for (const role of ['plan', 'build', 'review'] as const) {
    const spec = roles[role]
    if (spec) out[role] = { backend: spec.backend, ...(spec.model ? { model: spec.model } : {}) }
  }
  return out
}
