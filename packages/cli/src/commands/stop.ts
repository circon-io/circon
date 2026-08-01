import { ui } from '../core/ui.ts'
import { readLock, requestStop } from '../agent/lock.ts'

export async function stopCommand(): Promise<number> {
  const held = readLock()
  if (!held) {
    ui.info('No run is active.')
    return 0
  }

  requestStop()
  ui.ok(`Stop requested for ${held.project} (pid ${held.pid}).`)
  ui.dim('The loop finishes the current iteration, then exits with a clean tree.')
  return 0
}
