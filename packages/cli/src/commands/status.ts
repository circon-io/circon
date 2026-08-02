import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ui } from '../core/ui.ts'
import { readTasks } from '../agent/progress.ts'
import { readLock } from '../agent/lock.ts'
import { spentToday, usd } from '../agent/spend.ts'
import { readConfig } from '../core/config.ts'

/**
 * Progress moved out of PRD.md so the agent never writes the human's file, so
 * this is where you see it filled in instead.
 */
export async function statusCommand(): Promise<number> {
  const cwd = process.cwd()
  const cfg = readConfig()

  if (!existsSync(join(cwd, 'PRD.md'))) {
    ui.error('No PRD.md here. Run circon from a project root.')
    return 1
  }

  const tasks = readTasks(cwd)
  ui.heading('Tasks')
  if (tasks.length === 0) {
    ui.dim('  No `- [ ]` task lines found in PRD.md.')
  } else {
    for (const t of tasks) {
      ui.info(`  ${t.done ? '✓' : '·'} ${t.text}`)
    }
    const done = tasks.filter((t) => t.done).length
    ui.blank()
    ui.info(`  ${done} of ${tasks.length} complete`)
  }

  const lock = readLock()
  ui.blank()
  ui.info(lock ? `Running: ${lock.project} (pid ${lock.pid})` : 'Idle — no run active.')

  const today = spentToday()
  const cap = cfg.budgetPerDayUsd
  ui.info(cap > 0 ? `Spent today: ${usd(today)} of ${usd(cap)}` : `Spent today: ${usd(today)}`)
  return 0
}
