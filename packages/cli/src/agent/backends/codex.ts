import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { run, which } from '../../core/exec.ts'
import { detectUsageLimit } from './limits.ts'
import type { AgentBackend, AgentRequest, AgentResult, Availability, Exec } from './types.ts'

/**
 * OpenAI Codex CLI in non-interactive mode (`codex exec`).
 *
 * Billed to the ChatGPT plan it is logged in with, or an API key. It reports
 * tokens but not dollars, so its cost is recorded as unknown rather than zero.
 */

function withConventions(req: AgentRequest): string {
  // Codex has no system-prompt flag; the contract goes at the top of the task.
  return req.conventions
    ? `Engineering conventions this repository is held to:\n${req.conventions}\n\n---\n\n${req.prompt}`
    : req.prompt
}

export function codexArgs(req: AgentRequest, mode: 'build' | 'read', lastMessageFile: string): string[] {
  return [
    // Never pause for approval: nobody is there to give it.
    '--ask-for-approval', 'never',
    'exec',
    // Takes several values, so it goes before the next flag, never last where
    // it would swallow the prompt.
    ...(req.images?.length ? ['--image', req.images.join(',')] : []),
    '--json',
    '--output-last-message', lastMessageFile,
    ...(req.spec.model ? ['--model', req.spec.model] : []),
    ...(mode === 'build'
      ? [
          '--sandbox', 'workspace-write',
          // Installing a dependency is part of building; the sandbox blocks the
          // network otherwise.
          '--config', 'sandbox_workspace_write.network_access=true',
        ]
      : ['--sandbox', 'read-only']),
    withConventions(req),
  ]
}

interface CodexEvent {
  type?: string
  error?: { message?: string } | string
  message?: string
  item?: { type?: string; item_type?: string; text?: string }
}

/** The final agent message and any error text from the JSONL event stream. */
export function parseCodexEvents(stdout: string): { lastMessage: string; errors: string[] } {
  let lastMessage = ''
  const errors: string[] = []
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue
    let event: CodexEvent
    try {
      event = JSON.parse(line) as CodexEvent
    } catch {
      continue
    }
    const kind = event.item?.type ?? event.item?.item_type
    // Before v0.44 the message type was `assistant_message`.
    if (event.type === 'item.completed' && (kind === 'agent_message' || kind === 'assistant_message')) {
      lastMessage = event.item?.text ?? lastMessage
    }
    if (event.type === 'turn.failed' || event.type === 'error') {
      const detail = typeof event.error === 'string' ? event.error : (event.error?.message ?? event.message)
      if (detail) errors.push(detail)
    }
  }
  return { lastMessage, errors }
}

export function codexBackend(exec: Exec = run): AgentBackend {
  const invoke = async (req: AgentRequest, mode: 'build' | 'read'): Promise<AgentResult> => {
    const dir = mkdtempSync(join(tmpdir(), 'circon-codex-'))
    const lastMessageFile = join(dir, 'last-message.txt')
    try {
      const result = await exec('codex', codexArgs(req, mode, lastMessageFile), {
        cwd: req.cwd,
        timeoutMs: 45 * 60_000,
        ...(req.onOutput ? { onOutput: req.onOutput } : {}),
      })
      const output = result.stdout + result.stderr
      const events = parseCodexEvents(result.stdout)
      let text = events.lastMessage
      try {
        text = readFileSync(lastMessageFile, 'utf8') || text
      } catch {
        /* no final message — the event stream is the fallback */
      }
      const failed = !result.ok || events.errors.length > 0
      // Only error text is searched: a build output discussing rate limiting is
      // not a rate limit.
      const limited = failed ? detectUsageLimit([...events.errors, result.stderr].join('\n')) : null
      return { ok: !failed, output, text: text.trim(), costUsd: null, ...(limited ? { limited } : {}) }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  return {
    id: 'codex',
    vision: true,
    needsLocalModel: () => false,
    async available(): Promise<Availability> {
      if (!(await which('codex'))) {
        return { ok: false, billing: 'subscription', reason: "Codex is not installed — run 'circon setup --only js-globals'" }
      }
      const status = await exec('codex', ['login', 'status'], { timeoutMs: 20_000 })
      if (!status.ok) {
        return { ok: false, billing: 'subscription', reason: "Codex is not logged in — run 'codex login --device-auth'" }
      }
      return { ok: true, billing: /api key/i.test(status.stdout + status.stderr) ? 'api' : 'subscription' }
    },
    build: (req) => invoke(req, 'build'),
    plan: (req) => invoke(req, 'read'),
    review: (req) => invoke(req, 'read'),
  }
}
