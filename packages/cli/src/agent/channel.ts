/**
 * What a run tells the dashboard while it happens.
 *
 * The control plane's Durable Object always accepted `log`, `run-started` and
 * `run-finished`; nothing ever sent them, so the dashboard's log view stayed
 * empty through every run. A run now reports through this interface, and the
 * daemon backs it with its socket. A run started by hand gets the no-op.
 */

export interface RunProgress {
  runId: string
  project: string
  branch: string
  iteration: number
  costUsd: number
}

export interface RunChannel {
  /** Raw output, any chunking; split into lines and batched before sending. */
  log(text: string): void
  started(info: { runId: string; project: string; branch: string }): void
  progress(state: RunProgress): void
  finished(info: { runId: string; outcome: string; costUsd: number; prUrl?: string }): void
  /** Send anything still buffered. */
  flush(): void
  close(): void
}

export const silentChannel: RunChannel = {
  log() {},
  started() {},
  progress() {},
  finished() {},
  flush() {},
  close() {},
}

export type Outbound =
  | { type: 'log'; lines: string[] }
  | { type: 'run-started'; runId: string; project: string; branch: string }
  | { type: 'heartbeat'; state: Record<string, unknown> }
  | { type: 'run-finished'; runId: string; outcome: string; costUsd: number; prUrl?: string }

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g
const MAX_LINE = 2_000

/**
 * Batches log lines so a chatty agent costs a handful of socket frames a
 * second, not one per line. Partial lines are held until their newline, and
 * carriage-return progress bars collapse to their final state.
 */
export class BatchedChannel implements RunChannel {
  private readonly send: (message: Outbound) => void
  private readonly maxLines: number
  private readonly timer: ReturnType<typeof setInterval>
  private pending: string[] = []
  private partial = ''

  constructor(
    send: (message: Outbound) => void,
    opts: { intervalMs?: number; maxLines?: number } = {},
  ) {
    this.send = send
    this.maxLines = opts.maxLines ?? 50
    this.timer = setInterval(() => this.flush(), opts.intervalMs ?? 500)
    // Never the reason the process stays alive.
    this.timer.unref?.()
  }

  log(text: string): void {
    const combined = this.partial + text.replace(ANSI, '')
    const lines = combined.split('\n')
    this.partial = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.slice(raw.lastIndexOf('\r') + 1)
      this.pending.push(line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line)
    }
    if (this.pending.length >= this.maxLines) this.flush()
  }

  started(info: { runId: string; project: string; branch: string }): void {
    this.flush()
    this.send({ type: 'run-started', ...info })
  }

  progress(state: RunProgress): void {
    this.send({ type: 'heartbeat', state: { status: 'running', ...state } })
  }

  finished(info: { runId: string; outcome: string; costUsd: number; prUrl?: string }): void {
    if (this.partial) {
      this.pending.push(this.partial)
      this.partial = ''
    }
    this.flush()
    this.send({ type: 'run-finished', ...info })
  }

  flush(): void {
    if (this.pending.length === 0) return
    const lines = this.pending
    this.pending = []
    this.send({ type: 'log', lines })
  }

  close(): void {
    clearInterval(this.timer)
    this.flush()
  }
}
