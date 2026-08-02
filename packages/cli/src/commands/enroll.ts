import { hostname } from 'node:os'
import { ui } from '../core/ui.ts'
import { enroll, readEnrollment, writeEnrollment } from '../agent/control-plane.ts'
import { cliVersion } from './update.ts'

/**
 * One command to join a fleet. The token is one-time and short-lived, so it is
 * safe to paste into a terminal; what it returns is the long-lived credential
 * and that never leaves the machine again.
 */
export async function enrollCommand(args: string[]): Promise<number> {
  const tokenIdx = args.indexOf('--token')
  const urlIdx = args.indexOf('--url')
  const nameIdx = args.indexOf('--name')

  const token = tokenIdx >= 0 ? args[tokenIdx + 1] : undefined
  const url = urlIdx >= 0 ? args[urlIdx + 1] : process.env['CIRCON_CONTROL_PLANE']
  const name = nameIdx >= 0 ? args[nameIdx + 1] : hostname()

  if (!token || !url) {
    ui.error('Usage: circon enroll --url <control-plane-url> --token <token> [--name <name>]')
    ui.dim('  CIRCON_CONTROL_PLANE can supply the url instead of --url.')
    return 1
  }

  const existing = readEnrollment()
  if (existing) {
    ui.warn(`Already enrolled as "${existing.name}" (${existing.runnerId}).`)
    ui.dim('  Re-enrolling replaces that credential; the old one keeps working until revoked.')
  }

  ui.step(`Enrolling with ${url}…`)
  const result = await enroll(url, token, name ?? hostname(), cliVersion())

  if ('error' in result) {
    ui.error(`Enrollment failed: ${result.error}`)
    return 1
  }

  writeEnrollment(result)
  ui.ok(`Enrolled as "${result.name}" (${result.runnerId}) in ${result.org}.`)
  ui.dim(`  Credential written to ~/.config/circon/enrollment.json, mode 0600.`)
  ui.info("Start the daemon with 'circon agent', or install it with 'circon setup'.")
  return 0
}
