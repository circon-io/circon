import Anthropic from '@anthropic-ai/sdk'
import type { Env } from '../env.ts'
import { checkPrd, extractPrd, type PrdCheck } from './prd.ts'

/**
 * Turning an idea into a PRD the runner can build from.
 *
 * Runs in the control plane, on our key, because in the intended flow the plan
 * exists before any runner does. It is metered per org (see routes.ts).
 *
 * The system prompt is the conventions plus the PRD template: identical for
 * every request at a given conventions version, so it is prompt-cached and a
 * refinement pays only for the idea, the current PRD and the change.
 */

export const DEFAULT_PLAN_MODEL = 'claude-fable-5-1'
const DEFAULT_CONVENTIONS_BASE = 'https://raw.githubusercontent.com/circon-io/circon-conventions'

interface Conventions {
  architecture: string
  template: string
  ref: string
}

let cached: { key: string; at: number; value: Conventions } | null = null
const CONVENTIONS_TTL_MS = 10 * 60_000

/**
 * The conventions at the configured ref, cached per isolate. A plan must follow
 * the same contract the runner will be held to, so this reads the published
 * conventions rather than a copy bundled into the Worker that would drift.
 */
export async function loadConventions(env: Env, fetchImpl: typeof fetch = fetch): Promise<Conventions> {
  const base = env.CONVENTIONS_RAW_BASE || DEFAULT_CONVENTIONS_BASE
  const ref = env.CONVENTIONS_REF || 'main'
  const key = `${base}@${ref}`
  if (cached && cached.key === key && Date.now() - cached.at < CONVENTIONS_TTL_MS) return cached.value

  const get = async (path: string) => {
    const res = await fetchImpl(`${base}/${ref}/${path}`)
    if (!res.ok) throw new Error(`conventions: ${path} (HTTP ${res.status})`)
    return res.text()
  }
  const value = { architecture: await get('ARCHITECTURE.md'), template: await get('templates/PRD.md'), ref }
  cached = { key, at: Date.now(), value }
  return value
}

export function systemPrompt(conventions: Conventions): string {
  return `You write product requirement documents (PRDs) for circon, a system that builds
apps from idea to production. An autonomous coding agent will implement your PRD
one task at a time, on a machine that tests every change before committing it.
A human reviews your PRD before any of that happens.

What makes a PRD good here:
- It decides. Where the idea is vague, choose the simplest version that
  delivers the core value, and record the choice in Scope. Do not ask questions.
- Design principles that resolve future arguments, stating the trade-off.
- User flows that name every state the UI must handle (loading, empty, error),
  because each state becomes something the app must render and the gate checks.
- A task backlog the agent can execute in order. Each task is one line, small
  enough to finish and verify in a single iteration (roughly an hour of focused
  work), and independently testable. Order them so each builds on finished ones:
  data model and API first, then screens, then polish. Include the tests and
  the accessibility labels as part of the task that builds a thing, not as
  separate tasks at the end. Usually 15 to 60 tasks.
- Respect the stack and the project template in the conventions below. Do not
  plan tasks for what the template already provides (monorepo layout, CI/CD,
  the auth middleware, i18n setup); plan the product.
- An admin area, when the product needs one, lives inside the mobile app as
  role-gated screens backed by API routes that check the role on the server.

Output format — follow it exactly:
- Only the PRD markdown. No preamble, no closing remarks, no code fence around it.
- Use the section headings of the template below, in its order.
- Every task line is exactly "- [ ] <task>". No nested lists under tasks.
- Never leave a CIRCON-UNFILLED comment: write the section instead.

<conventions ref="${conventions.ref}">
${conventions.architecture}
</conventions>

<prd_template>
${conventions.template}
</prd_template>`
}

export type PlanRequest =
  | { mode: 'create'; idea: string; projectName: string }
  | { mode: 'refine'; currentPrd: string; instruction: string; projectName: string }

export function userMessage(req: PlanRequest): string {
  if (req.mode === 'create') {
    return `Write the PRD for this project.

Repository: ${req.projectName}

The idea, as the owner described it:
<idea>
${req.idea}
</idea>`
  }
  return `Here is the current PRD for ${req.projectName}:
<current_prd>
${req.currentPrd}
</current_prd>

Revise it as follows, changing nothing else, and output the complete revised PRD:
<change>
${req.instruction}
</change>`
}

export interface PlanResult {
  prd: string
  check: PrdCheck
  model: string
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
}

export class PlanError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/** The SDK surface the planner uses, so tests can substitute it. */
export type PlannerClient = Pick<Anthropic, 'beta'>

export function plannerClient(env: Env): PlannerClient {
  if (!env.ANTHROPIC_API_KEY) throw new PlanError('not_configured', 'ANTHROPIC_API_KEY is not set on the API Worker.')
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
}

/**
 * Stream a plan. `onText` receives the PRD as it is written, for the dashboard;
 * the resolved value is the finished, checked PRD.
 */
export async function generatePlan(
  env: Env,
  req: PlanRequest,
  onText: (text: string) => void,
  deps: { client?: PlannerClient; fetchImpl?: typeof fetch } = {},
): Promise<PlanResult> {
  const conventions = await loadConventions(env, deps.fetchImpl)
  const client = deps.client ?? plannerClient(env)
  const model = env.PLAN_MODEL || DEFAULT_PLAN_MODEL

  const stream = client.beta.messages.stream({
    model,
    // Streaming, so a long PRD cannot hit an HTTP timeout; generous, because
    // a truncated PRD is a wasted generation.
    max_tokens: 64000,
    // Thinking is always on for this model; effort is the control.
    output_config: { effort: 'high' },
    // A safety classifier can decline; fall back server-side instead of
    // returning nothing to someone who described a perfectly ordinary app.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: systemPrompt(conventions), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage(req) }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') onText(event.delta.text)
  }
  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new PlanError('refused', 'The planner declined this request. Rephrase the idea and try again.')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new PlanError('too_long', 'The plan ran past the length limit. Narrow the idea, or plan it in parts.')
  }

  const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
  const prd = extractPrd(text)
  return {
    prd,
    check: checkPrd(prd),
    model: message.model,
    usage: {
      inputTokens: message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0),
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    },
  }
}
