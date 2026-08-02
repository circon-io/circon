import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { run } from './exec.ts'
import { paths } from './paths.ts'
import { compareVersions } from './exec.ts'

/**
 * Conventions are a versioned dependency of the CLI, not a floating pointer.
 *
 * ARCHITECTURE.md states which package manager, Node version and SDKs to build
 * against. If the runner follows whatever is on HEAD, a convention edit can
 * instruct the agent to use tooling the machine does not have — and that
 * surfaces as a confusing gate error several iterations later rather than
 * "your conventions and your machine disagree".
 *
 * So the conventions repo is tagged, each tag declares the CLI it needs, and a
 * runner resolves the newest tag it can actually satisfy.
 */

/** Front-matter at the top of ARCHITECTURE.md, e.g. `requires-cli: >=0.4.0`. */
const REQUIRES = /^\s*requires-cli:\s*>=\s*([\d.]+)\s*$/m

export interface Resolution {
  /** Tag or branch checked out, or null when the repo is untagged. */
  ref: string | null
  /** Minimum CLI the resolved conventions ask for. */
  requiresCli: string | null
  /** Set when nothing satisfiable was found and HEAD was kept. */
  warning?: string
}

function architecturePath(): string {
  return join(paths.conventions, 'ARCHITECTURE.md')
}

export function declaredRequirement(text: string): string | null {
  return text.match(REQUIRES)?.[1] ?? null
}

export function currentRequirement(): string | null {
  const file = architecturePath()
  if (!existsSync(file)) return null
  return declaredRequirement(readFileSync(file, 'utf8'))
}

/** Semver-ish tags only: v1, v1.2, v1.2.3. */
function parseTags(raw: string): string[] {
  return raw
    .split('\n')
    .map((t) => t.trim())
    .filter((t) => /^v?\d+(\.\d+){0,2}$/.test(t))
    .sort((a, b) => compareVersions(a.replace(/^v/, ''), b.replace(/^v/, '')))
}

/**
 * Check out the newest tag whose `requires-cli` this CLI satisfies.
 *
 * An untagged repo is left on its default branch — versioning conventions is
 * opt-in, and a project that has not adopted it should keep working.
 */
export async function resolve(cliVersion: string): Promise<Resolution> {
  if (!existsSync(paths.conventions)) {
    return { ref: null, requiresCli: null, warning: 'conventions are not cloned' }
  }

  const git = (...args: string[]) => run('git', ['-C', paths.conventions, ...args])

  await git('fetch', '--tags', '--quiet')
  const tagList = await git('tag', '--list')
  const tags = parseTags(tagList.stdout)

  if (tags.length === 0) {
    return { ref: null, requiresCli: currentRequirement() }
  }

  // Newest first, so the first satisfiable tag wins.
  for (const tag of [...tags].reverse()) {
    const show = await git('show', `${tag}:ARCHITECTURE.md`)
    if (!show.ok) continue

    const needs = declaredRequirement(show.stdout)
    if (needs && compareVersions(cliVersion, needs) < 0) continue

    const checkout = await git('checkout', '--quiet', tag)
    if (!checkout.ok) continue
    return { ref: tag, requiresCli: needs }
  }

  const newest = tags.at(-1) ?? ''
  const newestNeeds = declaredRequirement(
    (await git('show', `${newest}:ARCHITECTURE.md`)).stdout,
  )
  return {
    ref: null,
    requiresCli: currentRequirement(),
    warning:
      `no conventions tag is satisfiable by CLI ${cliVersion}` +
      (newestNeeds ? ` — the newest (${newest}) needs >=${newestNeeds}` : '') +
      '. Run `npm update -g @circon/cli`.',
  }
}

/**
 * Does what ARCHITECTURE.md asks for actually exist on this machine?
 *
 * Deliberately advisory: this reports drift, it does not block a run. The
 * conventions are prose, and guessing wrong about what a sentence requires
 * should never stop someone working.
 */
export interface Drift {
  requirement: string
  detail: string
}

export async function detectDrift(cliVersion: string): Promise<Drift[]> {
  const file = architecturePath()
  if (!existsSync(file)) return []

  const text = readFileSync(file, 'utf8')
  const drift: Drift[] = []

  const needs = declaredRequirement(text)
  if (needs && compareVersions(cliVersion, needs) < 0) {
    drift.push({
      requirement: `CLI >= ${needs}`,
      detail: `this runner is ${cliVersion} — run \`npm update -g @circon/cli\``,
    })
  }

  // Only check tools the conventions name explicitly and that we can probe
  // cheaply. Anything vaguer is left to the reviewer.
  const probes: Array<[RegExp, string, string[]]> = [
    [/\bpnpm\b/, 'pnpm', ['--version']],
    [/\bExpo\b/i, 'expo', ['--version']],
    [/\bwrangler\b/i, 'wrangler', ['--version']],
  ]

  for (const [mention, binary, args] of probes) {
    if (!mention.test(text)) continue
    const probe = await run(binary, args, { timeoutMs: 20_000 })
    if (!probe.ok) {
      drift.push({
        requirement: `${binary} (named in ARCHITECTURE.md)`,
        detail: 'not installed or not responding',
      })
    }
  }

  return drift
}
