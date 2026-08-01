import { existsSync } from 'node:fs'
import { ui } from '../core/ui.ts'
import { run } from '../core/exec.ts'
import { paths } from '../core/paths.ts'

export async function updateCommand(): Promise<number> {
  if (!existsSync(paths.conventions)) {
    ui.error("Conventions are not cloned. Run 'circon setup --only conventions'.")
    return 1
  }

  const before = await run('git', ['-C', paths.conventions, 'rev-parse', '--short', 'HEAD'])
  const pull = await run('git', ['-C', paths.conventions, 'pull', '--ff-only'], { stream: true })
  if (!pull.ok) {
    ui.error('Could not fast-forward the conventions repo — it has local changes.')
    return 1
  }
  const after = await run('git', ['-C', paths.conventions, 'rev-parse', '--short', 'HEAD'])

  if (before.stdout.trim() === after.stdout.trim()) ui.ok('Conventions already up to date.')
  else ui.ok(`Conventions updated ${before.stdout.trim()} → ${after.stdout.trim()}.`)
  return 0
}
