import type { UsageLimit } from './types.ts'

/**
 * Recognizing "you are out of quota" in a coding CLI's output.
 *
 * On a subscription this is routine, not a failure: the session window resets
 * within hours. Treating it as a gate failure would trip the circuit breaker on
 * work that was never attempted, so the loop waits for the reset instead.
 */

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** `3:45pm`, `15:45`, optionally after a weekday: the next moment that matches. */
export function nextOccurrence(text: string, now = new Date()): Date | null {
  const m = text.trim().match(/^(?:(sun|mon|tue|wed|thu|fri|sat)\w*\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!m) return null
  let hour = Number(m[2])
  const minute = Number(m[3] ?? 0)
  const meridiem = m[4]?.toLowerCase()
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  if (hour > 23 || minute > 59) return null

  const at = new Date(now)
  at.setHours(hour, minute, 0, 0)
  const weekday = m[1] ? WEEKDAYS.indexOf(m[1].toLowerCase()) : -1
  if (weekday >= 0) {
    const ahead = (weekday - at.getDay() + 7) % 7
    at.setDate(at.getDate() + ahead)
    if (at <= now) at.setDate(at.getDate() + 7)
  } else if (at <= now) {
    at.setDate(at.getDate() + 1)
  }
  return at
}

const PATTERNS: Array<(text: string, now: Date) => UsageLimit | null> = [
  // Claude Code: "You've hit your session limit · resets 3:45pm"
  (text, now) => {
    const m = text.match(/hit your ([\w ]+?) limit\s*[·•-]?\s*resets\s+([^\n"]+)/i)
    return m ? { detail: `${m[1]} limit`, resetAt: nextOccurrence(m[2] ?? '', now) } : null
  },
  // Older Claude Code: "Claude AI usage limit reached|1760000000"
  (text) => {
    const m = text.match(/usage limit reached\|(\d{9,})/i)
    return m ? { detail: 'usage limit', resetAt: new Date(Number(m[1]) * 1000) } : null
  },
  // Codex: "... usage limit ... try again in 2 hours 13 minutes"
  (text, now) => {
    if (!/usage limit|rate limit/i.test(text)) return null
    const m = text.match(/try again in\s+(?:(\d+)\s*h\w*)?\s*(?:(\d+)\s*m\w*)?/i)
    const ms = m && (m[1] || m[2]) ? (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000 : null
    return { detail: 'usage limit', resetAt: ms ? new Date(now.getTime() + ms) : null }
  },
]

export function detectUsageLimit(output: string, now = new Date()): UsageLimit | null {
  // The last lines are where a CLI reports why it stopped.
  const tail = output.split('\n').slice(-40).join('\n')
  for (const pattern of PATTERNS) {
    const hit = pattern(tail, now)
    if (hit) return hit
  }
  return null
}
