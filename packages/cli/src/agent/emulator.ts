import { spawn } from 'node:child_process'
import { run, which } from '../core/exec.ts'

/**
 * Give the android gate a device, and take it away again afterwards.
 *
 * `setup` creates the `circon_pixel` AVD, but nothing ever booted it, so the
 * android tier silently did nothing unless a human had started an emulator by
 * hand. This boots one on first need and kills it at the end of the run, and
 * only ever kills one it started itself, so a device the human attached is
 * never touched.
 */

export const DEFAULT_AVD = 'circon_pixel'

export interface ChildHandle {
  kill(): Promise<void>
}

export interface EmulatorDeps {
  exec(cmd: string, args: string[], timeoutMs?: number): Promise<{ ok: boolean; output: string }>
  hasBinary(name: string): Promise<boolean>
  /** Start a long-lived process with its output discarded. */
  spawnDetached(cmd: string, args: string[]): ChildHandle
  sleep(ms: number): Promise<void>
}

export interface EnsureResult {
  ok: boolean
  /** True when this call booted the device, false when one was already there. */
  started: boolean
  reason?: string
}

/** A line such as `emulator-5554\tdevice`; `offline` and `unauthorized` do not count. */
export function attachedDevices(adbOutput: string): string[] {
  return adbOutput
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 2 && parts[1] === 'device')
    .map((parts) => parts[0] ?? '')
}

const realDeps: EmulatorDeps = {
  exec: async (cmd, args, timeoutMs) => {
    const r = await run(cmd, args, timeoutMs ? { timeoutMs } : {})
    return { ok: r.ok, output: `${r.stdout}${r.stderr}` }
  },
  hasBinary: async (name) => Boolean(await which(name)),
  spawnDetached: (cmd, args) => {
    // Output discarded rather than inherited: emulator chatter would otherwise
    // land in the log the agent reads as gate output.
    const child = spawn(cmd, args, { stdio: 'ignore' })
    const exited = new Promise<void>((resolve) => {
      child.once('exit', () => resolve())
      child.once('error', () => resolve())
    })
    return {
      kill: async () => {
        if (child.exitCode === null) child.kill('SIGTERM')
        // Reap it, so it never outlives the run as a zombie holding the GPU.
        await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))])
        if (child.exitCode === null) child.kill('SIGKILL')
      },
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export class AndroidEmulator {
  private readonly deps: EmulatorDeps
  private readonly avd: string
  private readonly bootTimeoutMs: number
  private child: ChildHandle | null = null
  private serial: string | null = null

  constructor(opts: { deps?: EmulatorDeps; avd?: string; bootTimeoutMs?: number } = {}) {
    this.deps = opts.deps ?? realDeps
    this.avd = opts.avd ?? DEFAULT_AVD
    this.bootTimeoutMs = opts.bootTimeoutMs ?? 240_000
  }

  /** Is a device usable now? Boots the AVD when none is attached. */
  async ensure(): Promise<EnsureResult> {
    const before = await this.deps.exec('adb', ['devices'])
    if (attachedDevices(before.output).length > 0) return { ok: true, started: false }
    if (this.child) return { ok: false, started: false, reason: 'the emulator this run started is gone' }

    if (!(await this.deps.hasBinary('emulator'))) {
      return { ok: false, started: false, reason: 'no `emulator` binary — run `circon setup --only android-sdk`' }
    }
    const avds = await this.deps.exec('emulator', ['-list-avds'])
    if (!avds.output.split('\n').map((l) => l.trim()).includes(this.avd)) {
      return { ok: false, started: false, reason: `no AVD named ${this.avd}` }
    }

    this.child = this.deps.spawnDetached('emulator', [
      '-avd', this.avd,
      '-no-window', '-no-audio', '-no-boot-anim',
      // Every run starts from the same clean device; nothing a previous run
      // installed or broke is carried into this one.
      '-no-snapshot-save',
    ])

    const deadline = this.bootTimeoutMs
    for (let waited = 0; waited < deadline; waited += 3_000) {
      await this.deps.sleep(3_000)
      const listed = attachedDevices((await this.deps.exec('adb', ['devices'])).output)
      const serial = listed.find((s) => s.startsWith('emulator-'))
      if (!serial) continue
      const booted = await this.deps.exec('adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], 10_000)
      if (booted.output.trim() === '1') {
        this.serial = serial
        return { ok: true, started: true }
      }
    }

    await this.release()
    return { ok: false, started: false, reason: `${this.avd} did not finish booting in ${Math.round(deadline / 1000)}s` }
  }

  /** Stop the emulator if, and only if, this instance started it. */
  async release(): Promise<void> {
    if (!this.child) return
    if (this.serial) await this.deps.exec('adb', ['-s', this.serial, 'emu', 'kill'], 15_000)
    await this.child.kill()
    this.child = null
    this.serial = null
  }
}
