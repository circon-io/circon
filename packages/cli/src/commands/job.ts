import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { run } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { Repo } from '../agent/git.ts'
import { readLock } from '../agent/lock.ts'
import { runCommand } from './run.ts'
import { cloneCredential } from '../agent/control-plane.ts'
import {
  configureCredentialHelper, credentialFlags, slugToHttps,
} from '../agent/git-credential.ts'

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
  /** The dispatched job's id, so the run report can close it. */
  jobId?: string
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
    // Probe the control plane first. A credential coming back proves three things
    // at once: this runner is enrolled, the project exists, and the GitHub App
    // still has access — all before git is given a chance to fail obscurely.
    const credential = opts.remote ? null : await cloneCredential(slug)
    const viaApp = credential ? slugToHttps(slug) : null
    const remote = opts.remote ?? viaApp ?? slugToRemote(slug)
    if (!remote) {
      ui.error(`Cannot derive a remote from "${slug}". Pass --remote.`)
      return 1
    }

    // The URL carries no token: the helper supplies one per request, so nothing
    // lands in .git/config and an hour-long expiry never strands a later push.
    ui.step(viaApp ? `Cloning ${slug} via the GitHub App…` : `Cloning ${slug}…`)
    const cloned = await run(
      'git',
      [...(viaApp ? await credentialFlags() : []), 'clone', remote, dir],
      { stream: true },
    )
    if (!cloned.ok) {
      ui.error(`Clone of ${slug} failed.`)
      ui.dim(
        viaApp
          ? '  The App token was rejected — confirm it still has access to this repository.'
          : '  No control-plane credential. Either enroll this runner, or authorize its SSH key.',
      )
      return 1
    }

    if (viaApp) await configureCredentialHelper(dir)
  } else {
    // Repair the helper on a checkout cloned by an older version, or one whose
    // local config was reset. Harmless when it is already right, and the helper
    // declines politely on a runner that is not enrolled.
    const origin = await run('git', ['-C', dir, 'remote', 'get-url', 'origin'])
    if (origin.ok && origin.stdout.trim().startsWith('https://github.com/')) {
      await configureCredentialHelper(dir)
    }

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
    return await runCommand(opts.maxLoops ?? 20, opts.jobId ? { jobId: opts.jobId } : {})
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
