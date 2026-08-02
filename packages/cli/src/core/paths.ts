import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, renameSync } from 'node:fs'

/**
 * Every path the CLI owns, in one place.
 *
 * XDG-ish but deliberately simple: config is what a human edits, state is what
 * the machine writes. Nothing here reads a cached "is it installed" marker —
 * component checks always probe the real system (see components/types.ts).
 */

const home = () => process.env['CIRCON_HOME'] ?? homedir()

export const paths = {
  get config() {
    return join(home(), '.config', 'circon')
  },
  get state() {
    return join(home(), '.local', 'state', 'circon')
  },
  get workspace() {
    return join(home(), 'AI-Workspace')
  },
  get conventions() {
    return join(home(), 'AI-Workspace', 'conventions')
  },
  get projects() {
    return join(home(), 'Projects')
  },
  get versionsFile() {
    return join(home(), '.config', 'circon', 'versions.json')
  },
  get envFile() {
    return join(home(), '.config', 'circon', 'env.sh')
  },
  get runLock() {
    return join(home(), '.local', 'state', 'circon', 'run.lock')
  },
  get stopFlag() {
    return join(home(), '.local', 'state', 'circon', 'stop')
  },
  get logs() {
    return join(home(), '.local', 'state', 'circon', 'logs')
  },
  credentials(name: string) {
    return join(home(), '.config', 'circon', `${name}.env`)
  },
}

/** Per-project paths, relative to a project root. */
export const projectPaths = {
  dir: '.circon',
  flows: join('.circon', 'flows'),
  expectedWeb: join('.circon', 'expected-web.txt'),
  expectedAndroid: join('.circon', 'expected-android.txt'),
  androidAppId: join('.circon', 'android-app-id'),
  clientDir: join('.circon', 'client-dir'),
  lastVerified: join('.circon', '.last-verified'),
  progress: join('.circon', 'progress.json'),
  conventions: join('.circon', 'ARCHITECTURE.md'),
}

export function ensureDirs(): void {
  for (const dir of [paths.config, paths.state, paths.logs, paths.workspace]) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * This tooling was called `solyd` before. Move the old directories across on
 * first run so an already-provisioned machine keeps its Telegram token and iOS
 * runner settings instead of silently reverting to defaults.
 *
 * Returns what it moved, so `setup` can report it rather than doing it silently.
 */
export function migrateLegacyPaths(): string[] {
  const moved: string[] = []
  const pairs: Array<[string, string]> = [
    [join(home(), '.config', 'solyd'), paths.config],
    [join(home(), '.local', 'state', 'ralph'), paths.logs],
  ]

  for (const [from, to] of pairs) {
    if (existsSync(from) && !existsSync(to)) {
      mkdirSync(join(to, '..'), { recursive: true })
      renameSync(from, to)
      moved.push(`${from} → ${to}`)
    }
  }
  return moved
}
