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

export interface Component {
  id: string
  /** What this provides, in a few words. Shown by `doctor`. */
  summary: string
  /** Components that must be `ok` before this one can install. */
  requires?: string[]
  /** Needs root. `setup` groups these so sudo is primed once. */
  privileged?: boolean
  /**
   * True when this component is only meaningful on the target OS. Checks still
   * run elsewhere (so `doctor` works on a laptop), but report `skipped`.
   */
  linuxOnly?: boolean

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
