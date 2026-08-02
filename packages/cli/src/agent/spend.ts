import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from '../core/paths.ts'

/**
 * Spend tracking and budget enforcement.
 *
 * The circuit breaker guards correctness — three consecutive gate failures and
 * the loop halts. Nothing guarded money: a loop that passes its gate every time
 * while producing mediocre work runs every iteration at full price.
 *
 * Two caps, because they fail differently:
 *   perRun  stops one runaway loop
 *   perDay  stops twenty small runs adding up to the same bill, machine-wide
 */

export interface SpendEntry {
  at: string
  project: string
  /** 'aider' | 'verify' | other future sources. */
  source: string
  usd: number
}

interface Ledger {
  entries: SpendEntry[]
}

const MAX_ENTRIES = 5000

function ledgerPath(): string {
  return `${paths.state}/spend.json`
}

function readLedger(): Ledger {
  if (!existsSync(ledgerPath())) return { entries: [] }
  try {
    const parsed = JSON.parse(readFileSync(ledgerPath(), 'utf8')) as Ledger
    return Array.isArray(parsed.entries) ? parsed : { entries: [] }
  } catch {
    // A corrupt ledger must never block a run. Losing history is survivable;
    // refusing to work because a JSON file is malformed is not.
    return { entries: [] }
  }
}

export function record(entry: Omit<SpendEntry, 'at'>): void {
  if (!Number.isFinite(entry.usd) || entry.usd <= 0) return
  const ledger = readLedger()
  ledger.entries.push({ at: new Date().toISOString(), ...entry })
  if (ledger.entries.length > MAX_ENTRIES) {
    ledger.entries = ledger.entries.slice(-MAX_ENTRIES)
  }
  mkdirSync(dirname(ledgerPath()), { recursive: true })
  writeFileSync(ledgerPath(), `${JSON.stringify(ledger, null, 2)}\n`)
}

/** Machine-wide spend since local midnight. */
export function spentToday(now = new Date()): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return readLedger()
    .entries.filter((e) => new Date(e.at) >= start)
    .reduce((sum, e) => sum + e.usd, 0)
}

export function spentSince(iso: string): number {
  const from = new Date(iso)
  return readLedger()
    .entries.filter((e) => new Date(e.at) >= from)
    .reduce((sum, e) => sum + e.usd, 0)
}

export function usd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/**
 * Tracks one run against both caps. A cap of 0 or less means "no limit", so a
 * user who has not configured budgets is not suddenly unable to work.
 */
export class RunBudget {
  private spent = 0
  private readonly project: string
  private readonly perRun: number
  private readonly perDay: number

  constructor(project: string, perRun: number, perDay: number) {
    this.project = project
    this.perRun = perRun
    this.perDay = perDay
  }

  /** Reason the run must not start, or null. Checked before the first call. */
  blockedBeforeStart(): string | null {
    if (this.perDay > 0) {
      const today = spentToday()
      if (today >= this.perDay) {
        return `daily budget already spent: ${usd(today)} of ${usd(this.perDay)}`
      }
    }
    return null
  }

  add(source: string, amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return
    this.spent += amount
    record({ project: this.project, source, usd: amount })
  }

  get total(): number {
    return this.spent
  }

  /** Reason to stop now, or null. Checked at each iteration boundary. */
  exceeded(): string | null {
    if (this.perRun > 0 && this.spent >= this.perRun) {
      return `run budget reached: ${usd(this.spent)} of ${usd(this.perRun)}`
    }
    if (this.perDay > 0) {
      const today = spentToday()
      if (today >= this.perDay) {
        return `daily budget reached: ${usd(today)} of ${usd(this.perDay)}`
      }
    }
    return null
  }

  summary(): string {
    const parts = [`this run ${usd(this.spent)}`]
    if (this.perRun > 0) parts.push(`cap ${usd(this.perRun)}`)
    if (this.perDay > 0) parts.push(`today ${usd(spentToday())} of ${usd(this.perDay)}`)
    return parts.join(' · ')
  }
}

/**
 * Pull a cost out of aider's output.
 *
 * aider prints, per message:
 *   Tokens: 1.2k sent, 345 received. Cost: $0.0123 message, $0.0456 session.
 *
 * We run one aider invocation per iteration, so the *session* figure is that
 * iteration's total and the last occurrence is the most complete. Returns null
 * when aider printed no cost line at all — a local-only model, or an aider
 * version that words it differently — so the caller can tell "free" apart from
 * "unknown" rather than silently recording zero.
 */
export function parseAiderCost(output: string): number | null {
  const matches = [...output.matchAll(/Cost:\s*\$[\d.]+\s*message,\s*\$([\d.]+)\s*session/gi)]
  const last = matches.at(-1)?.[1]
  if (last !== undefined) {
    const value = Number.parseFloat(last)
    return Number.isFinite(value) ? value : null
  }

  // Fall back to a bare "Cost: $x.xx" if the phrasing changes.
  const simple = [...output.matchAll(/Cost:\s*\$([\d.]+)/gi)].at(-1)?.[1]
  if (simple !== undefined) {
    const value = Number.parseFloat(simple)
    return Number.isFinite(value) ? value : null
  }
  return null
}

/**
 * Pull a cost out of `claude -p --output-format json`. The field has moved
 * between versions, so check the known spellings rather than assuming one.
 */
export function parseClaudeCost(stdout: string): number | null {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>
    for (const key of ['total_cost_usd', 'cost_usd', 'totalCostUsd']) {
      const value = parsed[key]
      if (typeof value === 'number' && Number.isFinite(value)) return value
    }
  } catch {
    /* not JSON — caller falls back */
  }
  return null
}
