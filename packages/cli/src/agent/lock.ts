import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from '../core/paths.ts'

/**
 * A single run at a time, and a stop that never lands mid-commit.
 *
 * The lock records a PID, so a lock left behind by a killed process is detected
 * and reclaimed rather than blocking the machine forever.
 */

export interface LockInfo {
  pid: number
  project: string
  startedAt: string
}

function processAlive(pid: number): boolean {
  try {
    // Signal 0 tests for existence without touching the process.
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function readLock(): LockInfo | null {
  if (!existsSync(paths.runLock)) return null
  try {
    return JSON.parse(readFileSync(paths.runLock, 'utf8')) as LockInfo
  } catch {
    return null
  }
}

/** Returns the holder when the lock is genuinely held, else null after claiming. */
export function acquireLock(project: string): LockInfo | null {
  const existing = readLock()
  if (existing && processAlive(existing.pid)) return existing

  mkdirSync(dirname(paths.runLock), { recursive: true })
  const info: LockInfo = {
    pid: process.pid,
    project,
    startedAt: new Date().toISOString(),
  }
  writeFileSync(paths.runLock, JSON.stringify(info, null, 2))
  return null
}

export function releaseLock(): void {
  const held = readLock()
  if (held && held.pid === process.pid && existsSync(paths.runLock)) {
    unlinkSync(paths.runLock)
  }
}

export function requestStop(): void {
  mkdirSync(dirname(paths.stopFlag), { recursive: true })
  writeFileSync(paths.stopFlag, new Date().toISOString())
}

export function stopRequested(): boolean {
  return existsSync(paths.stopFlag)
}

export function clearStop(): void {
  if (existsSync(paths.stopFlag)) unlinkSync(paths.stopFlag)
}
