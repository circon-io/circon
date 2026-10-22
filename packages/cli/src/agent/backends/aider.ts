import { run, which } from '../../core/exec.ts'
import type { RoleSpec } from '../../core/config.ts'
import { parseAiderCost } from '../spend.ts'
import { detectUsageLimit } from './limits.ts'
import type { AgentBackend, AgentRequest, AgentResult, Exec } from './types.ts'

/**
 * aider: an architect model plans each edit and a cheap editor applies it. With
 * a local Ollama editor, the expensive model never writes the diff.
 *
 * API billing only — aider cannot use a coding subscription.
 */

export const AIDER_DEFAULT_MODEL = 'sonnet'
export const AIDER_DEFAULT_EDITOR = 'ollama_chat/qwen2.5-coder:7b'
/** Long arguments past ~128 KB are rejected by Linux outright. */
const MAX_PROMPT_CHARS = 100_000

const isLocal = (model: string | undefined) => Boolean(model?.startsWith('ollama'))

function readFlags(req: AgentRequest): string[] {
  return [...req.conventionFiles.flatMap((f) => ['--read', f]), '--read', 'PRD.md']
}

export function aiderBuildArgs(req: AgentRequest): string[] {
  const model = req.spec.model ?? AIDER_DEFAULT_MODEL
  const editor = req.spec.editorModel ?? AIDER_DEFAULT_EDITOR
  return [
    'progress.txt', ...readFlags(req),
    '--architect',
    '--model', model,
    '--editor-model', editor,
    '--message', req.prompt.slice(0, MAX_PROMPT_CHARS),
    '--yes-always',
    '--no-auto-commits',
  ]
}

/** Ask mode: aider answers without touching a file. */
export function aiderAskArgs(req: AgentRequest): string[] {
  return [
    ...readFlags(req),
    '--chat-mode', 'ask',
    '--model', req.spec.model ?? AIDER_DEFAULT_MODEL,
    '--message', req.prompt.slice(0, MAX_PROMPT_CHARS),
    '--yes-always',
    '--no-auto-commits',
  ]
}

export function aiderBackend(exec: Exec = run): AgentBackend {
  const invoke = async (args: string[], req: AgentRequest): Promise<AgentResult> => {
    const result = await exec('aider', args, {
      cwd: req.cwd,
      stream: true,
      ...(req.onOutput ? { onOutput: req.onOutput } : {}),
    })
    const output = result.stdout + result.stderr
    const limited = result.ok ? null : detectUsageLimit(output)
    return {
      ok: result.ok,
      output,
      text: result.stdout.trim(),
      costUsd: parseAiderCost(output),
      ...(limited ? { limited } : {}),
    }
  }

  return {
    id: 'aider',
    needsLocalModel: (spec: RoleSpec) =>
      isLocal(spec.model) || isLocal(spec.editorModel ?? AIDER_DEFAULT_EDITOR),
    async available(spec) {
      const local = isLocal(spec.model ?? AIDER_DEFAULT_MODEL)
      const billing = local ? 'local' : 'api'
      if (!(await which('aider'))) return { ok: false, billing, reason: "aider is not installed — run 'circon setup'" }
      if (!local && !process.env['ANTHROPIC_API_KEY'] && !process.env['OPENAI_API_KEY']) {
        return { ok: false, billing, reason: "aider needs an API key — run 'circon config'" }
      }
      return { ok: true, billing }
    },
    build: (req) => invoke(aiderBuildArgs(req), req),
    plan: (req) => invoke(aiderAskArgs(req), req),
    review: (req) => invoke(aiderAskArgs(req), req),
  }
}
