import { diagnose } from './doctor.ts'
import { componentById, validateOrdering } from '../components/registry.ts'
import { ui } from '../core/ui.ts'
import { ensureDirs, migrateLegacyPaths } from '../core/paths.ts'
import { recordVersion } from '../core/spec.ts'
import { run } from '../core/exec.ts'

export interface SetupOptions {
  /** Perform upgrades for components reporting 'outdated'. Never implicit. */
  upgrade?: boolean
  /** Restrict to a single component id. */
  only?: string
  dryRun?: boolean
}

export async function setupCommand(opts: SetupOptions = {}): Promise<number> {
  validateOrdering()
  ui.heading('circon setup')

  const results = await diagnose()
  const targets = results.filter((d) => {
    if (opts.only && d.component.id !== opts.only) return false
    if (d.skipped || d.error) return false
    if (d.result?.status === 'missing') return true
    if (d.result?.status === 'outdated') return Boolean(opts.upgrade)
    return false
  })

  if (opts.only && !componentById(opts.only)) {
    ui.error(`Unknown component "${opts.only}". Run 'circon doctor' for the list.`)
    return 1
  }

  // The reason this whole redesign exists: a converged machine is a no-op.
  if (targets.length === 0) {
    const stale = results.filter((d) => d.result?.status === 'outdated')
    if (stale.length && !opts.upgrade) {
      ui.warn(`Nothing to install. ${stale.length} component(s) are outdated:`)
      for (const d of stale) ui.dim(`  ${d.component.id}: ${d.result?.detail ?? ''}`)
      ui.info("Run 'circon setup --upgrade' to move them.")
    } else {
      ui.ok('Nothing to do — the machine already matches the desired state.')
    }
    return 0
  }

  ui.info(`${targets.length} component(s) to converge:`)
  for (const d of targets) {
    ui.dim(`  ${d.component.id} — ${d.result?.detail ?? d.component.summary}`)
  }
  ui.blank()

  if (opts.dryRun) {
    ui.info('--dry-run: stopping before any changes.')
    return 0
  }

  // Only now do we touch the filesystem — everything above this line is a probe,
  // so --dry-run genuinely changes nothing.
  ensureDirs()
  const moved = migrateLegacyPaths()
  if (moved.length) {
    ui.info('Migrated from the previous solyd layout:')
    for (const m of moved) ui.ok(`  ${m}`)
  }

  // Prime sudo once so a long install never stalls on a password prompt.
  if (targets.some((d) => d.component.privileged)) {
    ui.step('Some components need root; priming sudo…')
    const primed = await run('sudo', ['-v'], { stream: true })
    if (!primed.ok) {
      ui.error('Could not obtain sudo. Re-run where you can authenticate.')
      return 1
    }
  }

  let failures = 0
  for (const { component, result } of targets) {
    const upgrading = result?.status === 'outdated'
    ui.step(`${upgrading ? 'Upgrading' : 'Installing'} ${component.id}…`)
    try {
      if (upgrading && component.upgrade) await component.upgrade()
      else await component.install()

      // Re-probe rather than trusting that install() worked.
      const after = await component.check()
      if (after.status === 'missing') {
        ui.error(`${component.id} still reports missing after install`)
        failures++
        continue
      }
      recordVersion(component.id, after.detail ?? 'installed', after.status === 'foreign')
      ui.ok(`${component.id} — ${after.detail ?? after.status}`)
    } catch (err) {
      failures++
      ui.error(`${component.id}: ${err instanceof Error ? err.message : String(err)}`)
      ui.dim('  Continuing — other components are independent.')
    }
  }

  ui.blank()
  if (failures) {
    ui.error(`${failures} component(s) failed. Re-run 'circon setup' to retry only those.`)
    return 1
  }
  ui.ok('Machine converged.')
  ui.dim("Run 'circon doctor' to confirm, or 'circon config' to set credentials.")
  return 0
}
