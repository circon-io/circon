import { platform } from 'node:os'
import { components } from '../components/registry.ts'
import type { CheckResult, Component } from '../components/types.ts'
import { ui } from '../core/ui.ts'
import { paths } from '../core/paths.ts'
import { detectDrift } from '../core/conventions.ts'
import { cliVersion } from './update.ts'
import { effectiveConfig } from '../core/config.ts'
import { realBackends, resolveRoles } from '../agent/backends/index.ts'
import type { AgentBackendId } from '../core/config.ts'

export interface Diagnosis {
  component: Component
  result: CheckResult | null
  skipped: boolean
  error?: string
}

/**
 * Probe everything and change nothing. `setup` calls this too, so there is one
 * definition of what "installed" means.
 */
export async function diagnose(): Promise<Diagnosis[]> {
  const onLinux = platform() === 'linux'
  const out: Diagnosis[] = []

  for (const component of components) {
    if (component.linuxOnly && !onLinux) {
      out.push({ component, result: null, skipped: true })
      continue
    }
    try {
      out.push({ component, result: await component.check(), skipped: false })
    } catch (err) {
      out.push({
        component,
        result: null,
        skipped: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return out
}

function statusLabel(d: Diagnosis): string {
  if (d.skipped) return ui.label.skipped()
  if (d.error) return ui.label.failed()
  switch (d.result?.status) {
    case 'ok': return ui.label.ok()
    case 'missing': return ui.label.missing()
    case 'outdated': return ui.label.outdated()
    case 'foreign': return ui.label.foreign()
    default: return ui.label.failed()
  }
}

export async function doctorCommand(): Promise<number> {
  ui.heading('circon doctor')

  const results = await diagnose()

  ui.table(
    results.map((d) => [
      statusLabel(d),
      ui.bold(d.component.id),
      d.skipped
        ? ui.muted('not applicable on this OS')
        : (d.error ?? d.result?.detail ?? d.component.summary),
    ]),
  )

  const missing = results.filter((d) => d.result?.status === 'missing')
  const outdated = results.filter((d) => d.result?.status === 'outdated')
  const foreign = results.filter((d) => d.result?.status === 'foreign')
  const failed = results.filter((d) => d.error)

  ui.blank()
  if (foreign.length) {
    ui.info(
      `${foreign.length} component(s) are provided by something other than circon. ` +
        `They satisfy the requirement, so setup will not touch them.`,
    )
  }
  if (outdated.length) {
    ui.warn(
      `${outdated.length} behind the desired version. ` +
        `'circon setup' will not change these — run 'circon setup --upgrade' deliberately.`,
    )
  }
  if (missing.length) {
    ui.warn(`${missing.length} missing. Run 'circon setup' to install just those.`)
  }
  if (failed.length) {
    ui.error(`${failed.length} check(s) errored — see the rows marked failed above.`)
  }
  if (!missing.length && !outdated.length && !failed.length) {
    ui.ok('Everything the machine needs is present.')
  }

  await agentsReport()

  const drift = await detectDrift(cliVersion())
  if (drift.length) {
    ui.blank()
    ui.warn('Conventions ask for things this machine does not have:')
    for (const d of drift) ui.dim(`  ${d.requirement} — ${d.detail}`)
  }

  ui.blank()
  ui.dim(`config: ${paths.config}`)
  ui.dim(`state:  ${paths.state}`)

  return failed.length > 0 ? 1 : 0
}

/**
 * Can each coding agent run here, and who pays for it? Separate from the
 * component table because installed is not the same as usable: Claude Code can
 * be present and logged out, and that only shows up as a failed run otherwise.
 */
async function agentsReport(): Promise<void> {
  const cfg = effectiveConfig()
  const roles = resolveRoles(cfg)
  const backends = realBackends()
  const used = new Map<AgentBackendId, string[]>()
  for (const role of ['plan', 'build', 'review'] as const) {
    const spec = roles[role]
    if (spec) used.set(spec.backend, [...(used.get(spec.backend) ?? []), role])
  }

  ui.blank()
  ui.info(ui.bold('Agents'))
  const rows: string[][] = []
  for (const id of Object.keys(backends) as AgentBackendId[]) {
    const spec = (['plan', 'build', 'review'] as const).map((r) => roles[r]).find((s) => s?.backend === id) ?? { backend: id }
    const availability = await backends[id].available(spec)
    const roleNote = used.get(id)?.length ? `used for ${used.get(id)!.join(', ')}` : 'not used'
    rows.push([
      availability.ok ? ui.label.ok() : used.has(id) ? ui.label.missing() : ui.label.skipped(),
      ui.bold(id),
      availability.ok ? `${availability.billing} · ${roleNote}` : `${availability.reason ?? 'unavailable'} · ${roleNote}`,
    ])
  }
  ui.table(rows)
}
