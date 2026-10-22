/**
 * Credentials the agent asks for, by writing a line in progress.txt:
 *
 *   NEEDS-SECRET: STRIPE_SECRET_KEY — checkout calls the Stripe API
 *
 * A line in the notes rather than a tool, because every backend (aider, Claude
 * Code, Codex) can write a file, and the notes are already where the agent
 * explains itself. The loop forwards each new request to the dashboard.
 */

export interface SecretRequest {
  name: string
  reason: string
}

const LINE = /^\s*NEEDS-SECRET:\s*([A-Z][A-Z0-9_]{0,63})\b\s*(?:[—–:-]+\s*(.*))?$/

export function parseSecretRequests(notes: string): SecretRequest[] {
  const seen = new Set<string>()
  const out: SecretRequest[] = []
  for (const line of notes.split('\n')) {
    const m = LINE.exec(line)
    if (!m?.[1] || seen.has(m[1])) continue
    seen.add(m[1])
    out.push({ name: m[1], reason: (m[2] ?? '').trim() || 'requested by the agent' })
  }
  return out
}

/** The standing instruction, part of every build prompt. */
export const SECRET_INSTRUCTION = [
  'If the task needs an API key or token you do not have, never invent one and',
  'never hard-code one. Read it from an environment variable, and ask for it',
  'with a line in progress.txt of the form:',
  '  NEEDS-SECRET: NAME_IN_UPPER_CASE — what it is for',
  'Then continue with whatever does not need it.',
].join('\n')
