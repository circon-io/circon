import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from './paths.ts'

/**
 * The desired state of the machine, versus what is actually on it.
 *
 * Two classes, and the distinction is the whole update story:
 *
 *  - PINNED   a surprise bump breaks the loop. Changing one of these is a
 *             deliberate act: `doctor` reports drift, `setup` refuses, and only
 *             `setup --upgrade` moves it.
 *  - FLOATING resolved to latest-stable at install time and allowed to move on
 *             its own. The Android platform is resolved from `sdkmanager --list`
 *             precisely so it does not rot here.
 */

export const PINNED = {
  /** agent-device needs 22.12; its web automation needs 24. */
  nodeMajor: 24,
  nodeMinimum: '22.12.0',
  /** Re-pulling this is a multi-GB mistake, so it is never implicit. */
  ollamaModel: 'qwen2.5-coder:7b',
  javaPackage: 'openjdk-17-jdk',
} as const

export const FLOATING = {
  /** Resolved from `sdkmanager --list`, newest stable, previews filtered out. */
  androidPlatform: 'latest-stable',
  androidBuildTools: 'latest-stable',
  npmGlobals: ['pnpm', 'yarn', 'agent-device', '@anthropic-ai/claude-code', 'eas-cli'],
} as const

/** What actually got installed, so drift is visible between releases. */
export interface VersionRecord {
  [componentId: string]: {
    version: string
    installedAt: string
    /** Set when we adopted rather than installed it. */
    foreign?: boolean
  }
}

export function readVersions(): VersionRecord {
  if (!existsSync(paths.versionsFile)) return {}
  try {
    return JSON.parse(readFileSync(paths.versionsFile, 'utf8')) as VersionRecord
  } catch {
    // A corrupt lockfile must never block a run — the real system is the
    // source of truth, this file is only a record.
    return {}
  }
}

export function recordVersion(id: string, version: string, isForeign = false): void {
  const all = readVersions()
  all[id] = {
    version,
    installedAt: new Date().toISOString(),
    ...(isForeign ? { foreign: true } : {}),
  }
  mkdirSync(dirname(paths.versionsFile), { recursive: true })
  writeFileSync(paths.versionsFile, `${JSON.stringify(all, null, 2)}\n`)
}
