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
   * Start a fresh branch for this run, from the up-to-date base.
   *
   * One branch per run rather than a long-lived work branch: it maps 1:1 to a
   * pull request and therefore to a single review decision, an abandoned run is
   * deleted without touching anything else, and conflicts stay bounded to one
   * run's changes. It also keeps the loop's `reset --hard` incapable of
   * discarding anything but the agent's own work.
   */
  async createRunBranch(branch: string, base: string): Promise<void> {
    const dirty = await this.git('status', '--porcelain')
    if (dirty.ok && dirty.stdout.trim()) {
      throw new Error('the working tree has uncommitted changes — commit or stash them first')
    }
    if ((await this.git('rev-parse', '--verify', base)).ok) {
      const checkout = await this.git('checkout', base)
      if (!checkout.ok) throw new Error(`could not check out ${base}: ${checkout.stderr.trim()}`)
    }
    const created = await this.git('checkout', '-b', branch)
    if (!created.ok) throw new Error(`could not create ${branch}: ${created.stderr.trim()}`)
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
