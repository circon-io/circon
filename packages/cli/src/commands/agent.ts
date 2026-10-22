import { hostname } from 'node:os'
import { ui } from '../core/ui.ts'
import { readEnrollment, claimJob, socketUrl, fetchConfig } from '../agent/control-plane.ts'
import { readLock, requestStop } from '../agent/lock.ts'
import { BatchedChannel, type Outbound } from '../agent/channel.ts'
import { currentRef } from '../core/conventions.ts'
import { machineHealth } from '../core/machine.ts'
import { jobCommand } from './job.ts'
import { cliVersion } from './update.ts'
import type { RefreshSignals } from './run.ts'

/**
 * The long-lived runner process.
 *
 * It holds a socket open so the dashboard can see this machine, stream its
 * runs and stop them, and it claims queued work. It must survive a
 * control-plane outage — a runner that dies because a service blipped is worse
 * than no daemon at all.
 */

const HEARTBEAT_MS = 30_000
const CLAIM_INTERVAL_MS = 15_000
// Disk and GPU change slowly, and nvidia-smi is not free.
const HEALTH_INTERVAL_MS = 10 * 60_000

function backoff(attempt: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 120_000)
}

type Inbound =
  | { type: 'command'; command: 'stop' | 'run' }
  | { type: 'config-changed' }
  | { type: 'prd-changed'; project: string }
  | { type: 'secrets-changed'; project?: string }

/**
 * Changes the dashboard made while a run was going. The loop takes them at its
 * next iteration boundary, so nothing changes under an iteration in flight.
 */
export class PendingRefresh implements RefreshSignals {
  private config = false
  private prd = false
  private secrets = false
  private readonly project: () => string | null

  constructor(project: () => string | null) {
    this.project = project
  }

  note(message: Inbound): void {
    if (message.type === 'config-changed') this.config = true
    if (message.type === 'prd-changed' && message.project === this.project()) this.prd = true
    // No project means a machine secret, which every project's job receives.
    if (message.type === 'secrets-changed' && (!message.project || message.project === this.project())) this.secrets = true
  }

  take(): { config: boolean; prd: boolean; secrets: boolean } {
    const taken = { config: this.config, prd: this.prd, secrets: this.secrets }
    this.config = false
    this.prd = false
    this.secrets = false
    return taken
  }
}

export async function agentCommand(): Promise<number> {
  const enrollment = readEnrollment()
  if (!enrollment) {
    ui.error("Not enrolled. Run 'circon enroll --url <url> --token <token>'.")
    return 1
  }

  ui.ok(`circon agent — ${enrollment.name} (${enrollment.runnerId})`)
  ui.dim(`control plane ${enrollment.url}`)

  const { config, stale } = await fetchConfig()
  if (stale) ui.warn('Using cached config — the control plane is unreachable.')
  else if (Object.keys(config).length) ui.dim('Config pulled from the control plane.')

  let attempt = 0
  let socket: WebSocket | null = null
  let running: string | null = null
  let stopping = false

  const send = (message: Outbound | Record<string, unknown>): void => {
    // Dropped while disconnected: the run log on disk is the record, the
    // dashboard view is live-only.
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  const hello = async () => {
    send({
      type: 'hello',
      cliVersion: cliVersion(),
      platform: `${process.platform} ${hostname()}`,
      conventionsRef: (await currentRef()) ?? undefined,
    })
    await reportHealth()
  }

  const reportHealth = async () => {
    send({ type: 'health', health: await machineHealth() })
  }

  const refresh = new PendingRefresh(() => running)

  const claimNow = async () => {
    if (running || readLock() || stopping) return
    const job = await claimJob()
    if (!job) return

    running = job.projectSlug
    ui.step(`Claimed job ${job.id} — ${job.projectSlug}`)
    const channel = new BatchedChannel(send)
    try {
      await jobCommand(job.projectSlug, {
        maxLoops: job.maxLoops,
        jobId: job.id,
        ...(job.config ? { config: job.config } : {}),
        channel,
        refresh,
      })
    } catch (error) {
      ui.error(`Job failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      channel.close()
      running = null
      refresh.take()
      // The job may have moved the conventions to another tag.
      await hello()
    }
  }

  const connect = () => {
    socket = new WebSocket(socketUrl(enrollment), [])

    socket.addEventListener('open', () => {
      attempt = 0
      ui.ok('Connected.')
      void hello()
    })

    socket.addEventListener('message', (event) => {
      let message: Inbound
      try {
        message = JSON.parse(String(event.data)) as Inbound
      } catch {
        return
      }

      if (message.type === 'command' && message.command === 'stop') {
        // Honored by writing the flag the loop checks between iterations —
        // never by killing the process mid-commit.
        const lock = readLock()
        if (lock) {
          requestStop()
          ui.warn(`Stop requested for ${lock.project} from the dashboard.`)
        }
        return
      }
      if (message.type === 'command' && message.command === 'run') {
        // A nudge to claim now. What to run still comes from the queue.
        void claimNow()
        return
      }
      refresh.note(message)
    })

    socket.addEventListener('close', () => {
      if (stopping) return
      attempt++
      const wait = backoff(attempt)
      ui.warn(`Disconnected. Reconnecting in ${wait / 1000}s…`)
      setTimeout(connect, wait)
    })

    socket.addEventListener('error', () => {
      // `close` always follows, so reconnection is handled in one place.
    })
  }

  connect()

  const heartbeat = setInterval(() => {
    // While a run is going it reports its own progress, which carries more.
    if (running) return
    const lock = readLock()
    send({
      type: 'heartbeat',
      state: lock ? { status: 'running', project: lock.project } : { status: 'idle' },
    })
  }, HEARTBEAT_MS)

  const poll = setInterval(() => void claimNow(), CLAIM_INTERVAL_MS)
  const health = setInterval(() => void reportHealth(), HEALTH_INTERVAL_MS)

  // Runs until killed by systemd or Ctrl-C.
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      stopping = true
      clearInterval(heartbeat)
      clearInterval(poll)
      clearInterval(health)
      socket?.close()
      ui.info('Agent stopped.')
      resolve()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })

  return 0
}
