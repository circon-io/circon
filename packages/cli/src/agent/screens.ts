import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { run, which } from '../core/exec.ts'
import { projectPaths } from '../core/paths.ts'

/**
 * Screenshots of every public screen, for the design review and the PR.
 *
 * Never an assertion: the gate checks the accessibility tree, and pixels are the
 * wrong thing to fail a build on. A person deciding whether to ship wants to
 * see the app, and so does a reviewer judging whether it is good to use.
 */

export const SHOT_DIR = join(projectPaths.dir, 'screenshots')
const FLOW = join(projectPaths.dir, 'flows', 'screens.sh')
const ROUTE_LIST = join(projectPaths.dir, 'screens.txt')
/** A review looks at a handful of screens well, not fifty badly. */
const MAX_ROUTES = 12

/** Where the Expo app lives, by the same rule as the flows' lib.sh. */
export function clientDir(cwd: string): string {
  const file = join(cwd, projectPaths.dir, 'client-dir')
  return existsSync(file) ? readFileSync(file, 'utf8').trim() || 'apps/mobile' : 'apps/mobile'
}

/**
 * The routes to capture. `.circon/screens.txt` wins when a project keeps one;
 * otherwise Expo Router's file routes, minus what a signed-out visitor cannot
 * reach: route groups (the template guards `(admin)` in its layout, and a group
 * is how a project marks a guarded area), dynamic segments, and special files.
 * Screens behind sign-in need a Clerk testing token, which is a later step.
 */
export function discoverRoutes(cwd: string): string[] {
  const listed = join(cwd, ROUTE_LIST)
  if (existsSync(listed)) {
    return readFileSync(listed, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => (l.startsWith('/') ? l : `/${l}`))
      .slice(0, MAX_ROUTES)
  }

  const root = join(cwd, clientDir(cwd), 'app')
  if (!existsSync(root)) return []
  const routes = new Set<string>()
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry.startsWith('(') || entry.startsWith('[') || entry.startsWith('_') || entry.startsWith('+')) continue
        walk(full, `${prefix}/${entry}`)
        continue
      }
      const m = /^([^.]+)(\.(web|native|ios|android))?\.(tsx|ts|jsx|js)$/.exec(entry)
      const name = m?.[1]
      if (!name || name.startsWith('_') || name.startsWith('+') || name.startsWith('[')) continue
      routes.add(name === 'index' ? prefix || '/' : `${prefix}/${name}`)
    }
  }
  walk(root, '')
  return [...routes].slice(0, MAX_ROUTES)
}

/** `/settings/profile` → `settings-profile.png`, `/` → `home.png`; the flow names files the same way. */
export function shotName(route: string): string {
  return `${route.replace(/^\/+/, '').replace(/\/+/g, '-') || 'home'}.png`
}

/**
 * Capture the routes through `.circon/flows/screens.sh`. Best effort: the work
 * is already committed, so nothing here may affect the run's outcome.
 */
export async function captureScreens(cwd: string): Promise<string[]> {
  if (!(await which('agent-device'))) return []
  if (!existsSync(join(cwd, FLOW))) return []
  const routes = discoverRoutes(cwd)
  if (!routes.length) return []

  await run('bash', [FLOW, ...routes], {
    cwd,
    env: { ...process.env, SHOT_DIR },
    timeoutMs: 10 * 60_000,
  })
  return routes.map((r) => join(SHOT_DIR, shotName(r))).filter((f) => existsSync(join(cwd, f)))
}
