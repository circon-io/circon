import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { ui } from '../core/ui.ts'
import { run } from '../core/exec.ts'
import { paths } from '../core/paths.ts'
import { resolve, detectDrift } from '../core/conventions.ts'

export function cliVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', '..', 'package.json'), 'utf8')) as {
      version: string
    }
    return pkg.version
  } catch {
    return '0.0.0'
  }
}

export async function updateCommand(): Promise<number> {
  if (!existsSync(paths.conventions)) {
    ui.error("Conventions are not cloned. Run 'circon setup --only conventions'.")
    return 1
  }

  const before = await run('git', ['-C', paths.conventions, 'rev-parse', '--short', 'HEAD'])

  // Pull the branch first so newly pushed tags are visible, then resolve.
  const pull = await run('git', ['-C', paths.conventions, 'pull', '--ff-only', '--quiet'])
  if (!pull.ok) {
    ui.warn('Could not fast-forward — the clone has local changes or is detached.')
  }

  const version = cliVersion()
  const resolution = await resolve(version)

  if (resolution.warning) {
    ui.warn(resolution.warning)
  } else if (resolution.ref) {
    ui.ok(`Conventions pinned to ${resolution.ref} (needs CLI >= ${resolution.requiresCli ?? 'any'})`)
  } else {
    const after = await run('git', ['-C', paths.conventions, 'rev-parse', '--short', 'HEAD'])
    ui.ok(
      before.stdout.trim() === after.stdout.trim()
        ? 'Conventions already up to date (untagged repo, following the branch).'
        : `Conventions updated ${before.stdout.trim()} → ${after.stdout.trim()}.`,
    )
  }

  const drift = await detectDrift(version)
  if (drift.length) {
    ui.blank()
    ui.warn('The conventions ask for things this machine does not have:')
    for (const d of drift) ui.dim(`  ${d.requirement} — ${d.detail}`)
  }

  return 0
}
