import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { run } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { Repo } from '../agent/git.ts'
import { readLock } from '../agent/lock.ts'
import { runCommand } from './run.ts'

/**
 * Run the loop against a named project rather than the current directory.
 *
 * `circon run` operates on `process.cwd()`, which is fine for a human sitting
 * in a checkout but useless for a dispatched job — the runner has to be told
 * *which* project, and be able to fetch it. A dashboard project is a connected
 * GitHub repository, so the slug is already `<org>__<repo>` and there is nothing
 * to invent.
 */

export function projectsRoot(): string {
  return process.env['CIRCON_PROJECTS'] ?? join(process.env['CIRCON_HOME'] ?? homedir(), 'circon-projects')
}

/** `org__repo` ⇢ `git@github.com:org/repo.git` */
export function slugToRemote(slug: string, host = 'github.com'): string | null {
  const parts = slug.split('__')
  if (parts.length !== 2) return null
  const [org, repo] = parts
  if (!org || !repo) return null
  return `git@${host}:${org}/${repo}.git`
}

export function remoteToSlug(remote: string): string | null {
  const m = remote.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/)
  return m?.[1] && m[2] ? `${m[1]}__${m[2]}` : null
}

/**
 * A slug becomes a directory name, so this is a security boundary as much as a
 * format check — `..` or a slash here would escape the projects root.
 *
 * Expressed as a split rather than one regex because `_` is a legal character
 * inside an org or repo name (`org__weblens_platform` is fine) while `__` is
 * the separator. A regex with `\w` cannot tell those apart, and `a__b__c` slips
 * through. The one thing this cannot represent is a repo literally named `a__b`.
 */
export function isValidSlug(slug: string): boolean {
  const parts = slug.split('__')
  if (parts.length !== 2) return false
  return parts.every(
    (part) => /^[A-Za-z0-9][\w.-]*$/.test(part) && !part.includes('..'),
  )
}

export interface JobOptions {
  maxLoops?: number
  /** Explicit remote, for a host other than github.com or a fork. */
  remote?: string
}

export async function jobCommand(slug: string | undefined, opts: JobOptions = {}): Promise<number> {
  if (!slug) {
    ui.error('Usage: circon job <org>__<repo> [maxLoops]')
    return 1
  }
  if (!isValidSlug(slug)) {
    ui.error(`"${slug}" is not a project slug. Expected <org>__<repo>.`)
    return 1
  }

  const held = readLock()
  if (held) {
    ui.error(`This runner is busy with ${held.project} (pid ${held.pid}).`)
    return 1
  }

  const root = projectsRoot()
  const dir = join(root, slug)
  mkdirSync(root, { recursive: true })

  if (!existsSync(dir)) {
    const remote = opts.remote ?? slugToRemote(slug)
    if (!remote) {
      ui.error(`Cannot derive a remote from "${slug}". Pass --remote.`)
      return 1
    }
    ui.step(`Cloning ${remote}…`)
    const cloned = await run('git', ['clone', remote, dir], { stream: true })
    if (!cloned.ok) {
      ui.error(`Clone failed. Check the runner's SSH key has access to ${slug}.`)
      return 1
    }
  } else {
    // Bring the checkout up to date before the run, which is the single pull
    // point — never mid-loop, where it would race the agent's own commits.
    const repo = new Repo(dir)
    const base = await repo.defaultBranch()

    const dirty = await run('git', ['-C', dir, 'status', '--porcelain'])
    if (dirty.ok && dirty.stdout.trim()) {
      ui.error(`${dir} has uncommitted changes — refusing to touch it.`)
      ui.dim('A previous run may have been killed. Inspect it, then commit or reset.')
      return 1
    }

    ui.step(`Updating ${slug}…`)
    await run('git', ['-C', dir, 'checkout', '--quiet', base])
    const pulled = await run('git', ['-C', dir, 'pull', '--ff-only', '--quiet'])
    if (!pulled.ok) ui.warn(`Could not fast-forward ${base}; running against the local copy.`)
  }

  // runCommand works on process.cwd(), so move there rather than threading a
  // directory through every call site.
  const previous = process.cwd()
  try {
    process.chdir(dir)
    return await runCommand(opts.maxLoops ?? 20)
  } finally {
    process.chdir(previous)
  }
}

export async function listProjects(): Promise<Array<{ slug: string; branch: string }>> {
  const root = projectsRoot()
  if (!existsSync(root)) return []

  const { readdirSync, statSync } = await import('node:fs')
  const out: Array<{ slug: string; branch: string }> = []

  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    try {
      if (!statSync(dir).isDirectory()) continue
      if (!existsSync(join(dir, '.git'))) continue
      const branch = await run('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])
      out.push({ slug: name, branch: branch.stdout.trim() })
    } catch {
      /* unreadable — skip */
    }
  }
  return out
}
