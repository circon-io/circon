/**
 * A machine component: something that can be probed and installed.
 *
 * The whole idempotency story lives in this contract. `check()` must probe the
 * real system every time — never read a cached "we installed this" marker —
 * because that is what makes re-running safe and what stops the model being
 * downloaded twice.
 */

export type Status =
  /** Present and satisfies the requirement. Nothing to do. */
  | 'ok'
  /** Not present. `setup` will install it. */
  | 'missing'
  /** Present, ours, but behind the desired version. `setup --upgrade` only. */
  | 'outdated'
  /**
   * Present and adequate, but installed by something other than us — nvm, the
   * distro, an existing Android Studio. We never touch these. Reported so the
   * operator can see why we are keeping our hands off.
   */
  | 'foreign'

export interface CheckResult {
  status: Status
  /** One short line shown next to the status. Versions, paths, or why. */
  detail?: string
}

/** The operating systems a runner can be. */
export type Platform = 'linux' | 'darwin'

export const EVERYWHERE: Platform[] = ['linux', 'darwin']

/** This machine's platform, or null on one circon does not provision. */
export function currentPlatform(): Platform | null {
  return process.platform === 'linux' || process.platform === 'darwin' ? process.platform : null
}

export interface Component {
  id: string
  /** What this provides, in a few words. Shown by `doctor`. */
  summary: string
  /** Components that must be `ok` before this one can install. */
  requires?: string[]
  /** Needs root. `setup` groups these so sudo is primed once. */
  privileged?: boolean
  /**
   * Where this component applies. Required, so a new component has to decide:
   * elsewhere it is reported `skipped` and never installed. Platform-specific
   * steps inside check() and install() branch on `currentPlatform()`.
   */
  platforms: Platform[]

  check(): Promise<CheckResult>
  install(): Promise<void>
  /** Only called by `setup --upgrade`, and only when check() said 'outdated'. */
  upgrade?(): Promise<void>
}

export function ok(detail?: string): CheckResult {
  return detail === undefined ? { status: 'ok' } : { status: 'ok', detail }
}
export function missing(detail?: string): CheckResult {
  return detail === undefined ? { status: 'missing' } : { status: 'missing', detail }
}
export function outdated(detail: string): CheckResult {
  return { status: 'outdated', detail }
}
export function foreign(detail: string): CheckResult {
  return { status: 'foreign', detail }
}
