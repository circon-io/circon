import { statfsSync } from 'node:fs'
import { run, which } from '../core/exec.ts'
import { paths } from '../core/paths.ts'

/**
 * Telling infrastructure failure apart from the agent writing bad code.
 *
 * Without this, an Ollama OOM fails the gate, trips the circuit breaker after
 * three iterations, and reports "gate failure at the unit tests tier". The
 * diagnosis is wrong and three iterations were paid for to reach it.
 *
 * Infrastructure failures must not count toward the breaker — the agent did
 * nothing wrong, and reverting its work teaches it nothing.
 */

export interface HealthProblem {
  what: string
  detail: string
  /** Whether waiting is likely to help. Disk full: no. Ollama restarting: yes. */
  transient: boolean
}

const MIN_FREE_GB = 5

/** Cheap probes, run before each iteration. */
export async function preflight(needsLocalModel: boolean): Promise<HealthProblem | null> {
  try {
    const fs = statfsSync(paths.state)
    const freeGb = (fs.bavail * fs.bsize) / 1024 ** 3
    if (freeGb < MIN_FREE_GB) {
      return {
        what: 'disk',
        detail: `${freeGb.toFixed(1)} GB free, need ${MIN_FREE_GB} GB`,
        transient: false,
      }
    }
  } catch {
    /* statfs unavailable — not worth failing a run over */
  }

  if (needsLocalModel && (await which('ollama'))) {
    const list = await run('ollama', ['list'], { timeoutMs: 10_000 })
    if (!list.ok) {
      return { what: 'ollama', detail: 'not responding to `ollama list`', transient: true }
    }
  }

  return null
}

/**
 * Signatures that mean "the machine broke", not "the code is wrong".
 *
 * Deliberately narrow. A false positive here is worse than a false negative:
 * misclassifying a real gate failure as infrastructure means the loop retries
 * broken code forever instead of stopping.
 */
const INFRA_SIGNATURES: Array<[RegExp, string]> = [
  [/ECONNREFUSED|connection refused/i, 'a service refused the connection'],
  [/ENOSPC|no space left on device/i, 'the disk is full'],
  [/ENOMEM|out of memory|Killed process|oom-kill/i, 'the process ran out of memory'],
  [/EMFILE|too many open files/i, 'file descriptor limit'],
  [/ETIMEDOUT|ESOCKETTIMEDOUT|network is unreachable/i, 'the network timed out'],
  [/ollama.*(?:not running|failed to connect|500 Internal)/i, 'Ollama is unhealthy'],
  [/could not connect to.*(?:daemon|adb server)/i, 'a device daemon is unreachable'],
  [/429 Too Many Requests|rate.?limit(?:ed)?/i, 'an API rate limit'],
  [/5\d\d\s+(?:Internal Server Error|Bad Gateway|Service Unavailable)/i, 'an upstream 5xx'],
]

export function classifyFailure(output: string): HealthProblem | null {
  // Only inspect the tail: an infra signature in an early log line is usually
  // noise, whereas the thing that actually killed the run is at the end.
  const tail = output.split('\n').slice(-60).join('\n')
  for (const [pattern, detail] of INFRA_SIGNATURES) {
    if (pattern.test(tail)) {
      return {
        what: 'infrastructure',
        detail,
        transient: !/no space left|disk is full/i.test(detail),
      }
    }
  }
  return null
}

/** Backoff for transient problems: 30s, 60s, 120s, capped. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 300_000)
}
