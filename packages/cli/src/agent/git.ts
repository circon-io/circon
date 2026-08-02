import { run } from '../core/exec.ts'

/** Thin, typed wrapper. Every call is scoped to an explicit repo directory. */
export class Repo {
  // Written out rather than a constructor parameter property: those are not
  // erasable syntax, so Node's type stripping rejects them and the CLI cannot
  // be run from source. `erasableSyntaxOnly` in tsconfig keeps it that way.
  readonly cwd: string

  constructor(cwd: string) {
    this.cwd = cwd
  }

  private git(...args: string[]) {
    return run('git', args, { cwd: this.cwd })
  }

  async isRepo(): Promise<boolean> {
    return (await this.git('rev-parse', '--git-dir')).ok
  }

  async head(): Promise<string | null> {
    const r = await this.git('rev-parse', 'HEAD')
    return r.ok ? r.stdout.trim() : null
  }

  async currentBranch(): Promise<string> {
    const r = await this.git('rev-parse', '--abbrev-ref', 'HEAD')
    return r.stdout.trim()
  }

  async hasRemote(): Promise<boolean> {
    const r = await this.git('remote')
    return r.ok && r.stdout.trim().length > 0
  }

  async defaultBranch(): Promise<string> {
    const r = await this.git('symbolic-ref', 'refs/remotes/origin/HEAD')
    const name = r.ok ? r.stdout.trim().split('/').pop() : null
    if (name) return name
    for (const candidate of ['main', 'master']) {
      if ((await this.git('rev-parse', '--verify', candidate)).ok) return candidate
    }
    return 'main'
  }

  /**
   * Put the agent on its own branch.
   *
   * This is what makes the loop's `reset --hard` safe: it can only ever discard
   * the agent's own work, never a human commit on the default branch. Your PRD
   * edits land on main and are merged in here at run start.
   */
  async ensureWorkBranch(branch: string, base: string): Promise<{ created: boolean; merged: boolean }> {
    const exists = (await this.git('rev-parse', '--verify', branch)).ok
    let created = false

    if (!exists) {
      const r = await this.git('checkout', '-b', branch)
      if (!r.ok) throw new Error(`could not create ${branch}: ${r.stderr.trim()}`)
      created = true
    } else if ((await this.currentBranch()) !== branch) {
      const r = await this.git('checkout', branch)
      if (!r.ok) throw new Error(`could not switch to ${branch}: ${r.stderr.trim()}`)
    }

    // Bring in whatever landed on the base branch since the last run — this is
    // the single pull point, before any iteration starts.
    let merged = false
    if (!created && (await this.git('rev-parse', '--verify', base)).ok) {
      const r = await this.git('merge', '--no-edit', base)
      merged = r.ok
      if (!r.ok) {
        await this.git('merge', '--abort')
        throw new Error(
          `merging ${base} into ${branch} conflicts. Resolve it by hand, then re-run.`,
        )
      }
    }
    return { created, merged }
  }

  async fetch(): Promise<boolean> {
    if (!(await this.hasRemote())) return false
    return (await this.git('fetch', '--quiet', '--all')).ok
  }

  async pullBase(base: string): Promise<boolean> {
    if (!(await this.hasRemote())) return false
    return (await this.git('fetch', 'origin', `${base}:${base}`)).ok
  }

  async push(branch: string): Promise<boolean> {
    if (!(await this.hasRemote())) return false
    return (await this.git('push', '--set-upstream', 'origin', branch)).ok
  }

  async stageAll(): Promise<void> {
    await this.git('add', '.')
  }

  async hasStagedChanges(): Promise<boolean> {
    return !(await this.git('diff', '--cached', '--quiet')).ok
  }

  async commit(message: string): Promise<boolean> {
    return (await this.git('commit', '-m', message)).ok
  }

  async hardReset(): Promise<void> {
    await this.git('reset', '--hard', 'HEAD')
    await this.git('clean', '-fd')
  }

  /**
   * The PRD task that just flipped to done, read from the staged diff, so the
   * commit subject names the work instead of "completed automated task".
   */
  async completedTaskFromDiff(prdFile = 'PRD.md'): Promise<string | null> {
    const r = await this.git('diff', '--cached', '-U0', '--', prdFile)
    if (!r.ok) return null
    for (const line of r.stdout.split('\n')) {
      const m = line.match(/^\+- \[[xX]\]\s*(.+)$/)
      if (m?.[1]) return m[1].trim()
    }
    return null
  }

  /** Commit subjects produced by this run only. */
  async commitsSince(ref: string | null): Promise<string[]> {
    const range = ref ? [`${ref}..HEAD`] : []
    const r = await this.git('log', ...range, '--format=%s')
    return r.ok ? r.stdout.split('\n').filter(Boolean) : []
  }

  async diffSince(ref: string): Promise<string> {
    const r = await this.git('diff', `${ref}..HEAD`)
    return r.ok ? r.stdout : ''
  }

  async refExists(ref: string): Promise<boolean> {
    return (await this.git('cat-file', '-e', ref)).ok
  }

  async firstCommit(): Promise<string | null> {
    const r = await this.git('rev-list', '--max-parents=0', 'HEAD')
    return r.ok ? (r.stdout.trim().split('\n')[0] ?? null) : null
  }
}
