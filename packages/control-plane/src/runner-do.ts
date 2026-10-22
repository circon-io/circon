import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env.ts'

/**
 * One Durable Object per runner: its live state, its log tail, and the socket
 * the dashboard watches.
 *
 * WebSocket *hibernation* is what makes an idle fleet free — `acceptWebSocket`
 * hands the connection to the runtime, the object is evicted from memory, and
 * it is only revived when a message actually arrives. A runner that sits idle
 * overnight costs nothing.
 */

const LOG_LINES = 500
const OFFLINE_AFTER_MS = 90_000
/** `runners.last_seen_at` is for reclaiming dead jobs, not live status: once a minute is plenty. */
const PERSIST_SEEN_MS = 60_000

export interface RunnerState {
  status: 'idle' | 'running' | 'offline'
  project?: string
  branch?: string
  runId?: string
  iteration?: number
  costUsd?: number
  lastSeenAt?: string
  startedAt?: string
}

type Inbound =
  | { type: 'hello'; cliVersion?: string; platform?: string; conventionsRef?: string }
  | { type: 'heartbeat'; state: Partial<RunnerState> }
  | { type: 'log'; lines: string[] }
  | { type: 'run-started'; runId: string; project: string; branch: string }
  | { type: 'run-finished'; runId: string; outcome: string; costUsd: number; prUrl?: string }

type Outbound =
  | { type: 'state'; state: RunnerState }
  | { type: 'log'; lines: string[] }
  | { type: 'command'; command: 'stop' | 'run' }
  | { type: 'config-changed' }
  | { type: 'prd-changed'; project: string }

export class RunnerDO extends DurableObject<Env> {
  private logs: string[] = []
  private state: RunnerState = { status: 'offline' }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/socket')) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 })
      }
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]

      // The object is addressed by runner id but cannot read its own name, so
      // the Worker passes it along; it is what lets the object write to D1.
      const runner = url.searchParams.get('runner')
      if (runner) await this.ctx.storage.put('runnerId', runner)

      // Hibernation: the runtime holds the socket, not this object.
      this.ctx.acceptWebSocket(server, [url.searchParams.get('role') ?? 'observer'])
      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname.endsWith('/state')) {
      return Response.json(await this.currentState())
    }

    if (url.pathname.endsWith('/logs')) {
      const stored = (await this.ctx.storage.get<string[]>('logs')) ?? []
      return Response.json({ lines: stored })
    }

    if (url.pathname.endsWith('/command') && request.method === 'POST') {
      const command = (await request.json()) as Outbound
      const delivered = this.broadcast(command, 'runner')
      return Response.json({ ok: true, delivered })
    }

    return new Response('Not found', { status: 404 })
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return
    let message: Inbound
    try {
      message = JSON.parse(raw) as Inbound
    } catch {
      return
    }

    switch (message.type) {
      case 'hello':
      case 'heartbeat': {
        const patch = message.type === 'heartbeat' ? message.state : {}
        const previous = await this.currentState()
        this.state = {
          ...previous,
          ...patch,
          status: patch.status ?? (message.type === 'hello' && previous.status === 'running' ? 'running' : 'idle'),
          lastSeenAt: new Date().toISOString(),
        }
        if (this.state.status !== 'running') {
          delete this.state.runId
          delete this.state.iteration
        }
        await this.persistSeen(
          message.type === 'hello'
            ? {
                ...(message.cliVersion ? { cliVersion: message.cliVersion } : {}),
                ...(message.conventionsRef ? { conventionsRef: message.conventionsRef } : {}),
              }
            : undefined,
        )
        await this.ctx.storage.put('state', this.state)
        // A missed heartbeat is what makes a runner show as offline, so an
        // alarm is scheduled rather than relying on the dashboard polling.
        await this.ctx.storage.setAlarm(Date.now() + OFFLINE_AFTER_MS)
        this.broadcast({ type: 'state', state: this.state }, 'observer')
        break
      }

      case 'log': {
        await this.appendLogs(message.lines)
        this.broadcast({ type: 'log', lines: message.lines }, 'observer')
        break
      }

      case 'run-started': {
        this.state = {
          ...(await this.currentState()),
          status: 'running',
          runId: message.runId,
          project: message.project,
          branch: message.branch,
          startedAt: new Date().toISOString(),
          costUsd: 0,
        }
        await this.ctx.storage.put('state', this.state)
        this.broadcast({ type: 'state', state: this.state }, 'observer')
        break
      }

      case 'run-finished': {
        const previous = await this.currentState()
        this.state = {
          ...previous,
          status: 'idle',
          costUsd: message.costUsd,
          lastSeenAt: new Date().toISOString(),
        }
        delete this.state.runId
        delete this.state.iteration
        await this.ctx.storage.put('state', this.state)
        this.broadcast({ type: 'state', state: this.state }, 'observer')
        break
      }
    }

    void ws
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const tags = this.ctx.getTags(ws)
    if (tags.includes('runner')) {
      const current = await this.currentState()
      this.state = { ...current, status: 'offline' }
      await this.ctx.storage.put('state', this.state)
      this.broadcast({ type: 'state', state: this.state }, 'observer')
    }
  }

  /** No heartbeat inside the window means the runner is gone, not idle. */
  override async alarm(): Promise<void> {
    const current = await this.currentState()
    const last = current.lastSeenAt ? Date.parse(current.lastSeenAt) : 0
    if (Date.now() - last >= OFFLINE_AFTER_MS) {
      this.state = { ...current, status: 'offline' }
      await this.ctx.storage.put('state', this.state)
      this.broadcast({ type: 'state', state: this.state }, 'observer')
    }
  }

  /**
   * Write `last_seen_at` through to D1, throttled; versions are written whenever
   * a hello carries them. Failure is swallowed: D1 being slow must never drop a
   * runner's socket.
   */
  private async persistSeen(versions?: { cliVersion?: string; conventionsRef?: string }): Promise<void> {
    const runnerId = await this.ctx.storage.get<string>('runnerId')
    if (!runnerId) return
    const last = (await this.ctx.storage.get<number>('persistedAt')) ?? 0
    const hasVersions = Boolean(versions?.cliVersion || versions?.conventionsRef)
    if (!hasVersions && Date.now() - last < PERSIST_SEEN_MS) return
    try {
      await this.env.DB.prepare(
        `UPDATE runners SET last_seen_at = ?1,
           cli_version = COALESCE(?2, cli_version),
           conventions_ref = COALESCE(?3, conventions_ref)
         WHERE id = ?4`,
      )
        .bind(new Date().toISOString(), versions?.cliVersion ?? null, versions?.conventionsRef ?? null, runnerId)
        .run()
      await this.ctx.storage.put('persistedAt', Date.now())
    } catch (error) {
      console.error('could not persist last_seen_at', error)
    }
  }

  private async currentState(): Promise<RunnerState> {
    const stored = await this.ctx.storage.get<RunnerState>('state')
    return stored ?? this.state
  }

  private async appendLogs(lines: string[]): Promise<void> {
    const stored = (await this.ctx.storage.get<string[]>('logs')) ?? []
    // A ring buffer, so a long run cannot grow this object without bound.
    const next = [...stored, ...lines].slice(-LOG_LINES)
    this.logs = next
    await this.ctx.storage.put('logs', next)
  }

  private broadcast(message: Outbound, toTag: string): number {
    const payload = JSON.stringify(message)
    let delivered = 0
    for (const socket of this.ctx.getWebSockets(toTag)) {
      try {
        socket.send(payload)
        delivered++
      } catch {
        /* a dead socket is cleaned up by the runtime */
      }
    }
    return delivered
  }
}
