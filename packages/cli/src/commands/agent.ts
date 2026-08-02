import { hostname } from 'node:os'
import { ui } from '../core/ui.ts'
import { readEnrolment, claimJob, socketUrl, fetchConfig } from '../agent/control-plane.ts'
import { readLock, requestStop } from '../agent/lock.ts'
import { jobCommand } from './job.ts'

/**
 * The long-lived runner process.
 *
 * Two jobs: hold a socket open so the dashboard can see this machine and stop
 * it, and poll for queued work. It must survive a control-plane outage — a
 * runner that dies because a service blipped is worse than no daemon at all.
 */

const HEARTBEAT_MS = 30_000
const CLAIM_INTERVAL_MS = 15_000

function backoff(attempt: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempt - 1), 120_000)
}

export async function agentCommand(): Promise<number> {
  const enrolment = readEnrolment()
  if (!enrolment) {
    ui.error("Not enrolled. Run 'circon enroll --url <url> --token <token>'.")
    return 1
  }

  ui.ok(`circon agent — ${enrolment.name} (${enrolment.runnerId})`)
  ui.dim(`control plane ${enrolment.url}`)

  const { config, stale } = await fetchConfig()
  if (stale) ui.warn('Using cached config — the control plane is unreachable.')
  else if (Object.keys(config).length) ui.dim('Config pulled from the control plane.')

  let attempt = 0
  let socket: WebSocket | null = null
  let running = false

  const connect = () => {
    socket = new WebSocket(socketUrl(enrolment), [])

    socket.addEventListener('open', () => {
      attempt = 0
      ui.ok('Connected.')
      socket?.send(JSON.stringify({
        type: 'hello',
        cliVersion: process.env['npm_package_version'] ?? 'unknown',
        platform: `${process.platform} ${hostname()}`,
      }))
    })

    socket.addEventListener('message', (event) => {
      let message: { type?: string; command?: string }
      try {
        message = JSON.parse(String(event.data)) as { type?: string; command?: string }
      } catch {
        return
      }
      // Stop is honoured by writing the flag the loop checks between
      // iterations — never by killing the process mid-commit.
      if (message.type === 'command' && message.command === 'stop') {
        const lock = readLock()
        if (lock) {
          requestStop()
          ui.warn(`Stop requested for ${lock.project} from the dashboard.`)
        }
      }
    })

    socket.addEventListener('close', () => {
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
    if (socket?.readyState !== WebSocket.OPEN) return
    const lock = readLock()
    socket.send(JSON.stringify({
      type: 'heartbeat',
      state: lock
        ? { status: 'running', project: lock.project }
        : { status: 'idle' },
    }))
  }, HEARTBEAT_MS)

  const poll = setInterval(() => {
    void (async () => {
      if (running || readLock()) return
      const job = await claimJob()
      if (!job) return

      running = true
      ui.step(`Claimed job ${job.id} — ${job.projectSlug}`)
      try {
        await jobCommand(job.projectSlug, { maxLoops: job.maxLoops })
      } catch (error) {
        ui.error(`Job failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        running = false
      }
    })()
  }, CLAIM_INTERVAL_MS)

  // Runs until killed by systemd or Ctrl-C.
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      clearInterval(heartbeat)
      clearInterval(poll)
      socket?.close()
      ui.info('Agent stopped.')
      resolve()
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })

  return 0
}
