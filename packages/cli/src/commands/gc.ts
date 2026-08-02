import { existsSync, readdirSync, statSync, unlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { run, which } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { paths } from '../core/paths.ts'

/**
 * Reclaim disk, conservatively.
 *
 * Only things that are cheap to recreate. Explicitly never touched: Ollama
 * models (a re-pull is gigabytes), Docker volumes, and anything pnpm still
 * references. The cost of deleting something expensive by accident is far
 * higher than the disk it frees.
 */

const LOG_MAX_AGE_DAYS = 30
const PNPM_STORE_LIMIT_GB = 10

export interface GcOptions {
  dryRun?: boolean
  /** Prune branches in this project too, not just machine-level state. */
  cwd?: string
}

interface Reclaimed {
  what: string
  bytes: number
  count: number
}

function ageInDays(path: string): number {
  return (Date.now() - statSync(path).mtimeMs) / 86_400_000
}

function human(bytes: number): string {
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(0)} KB`
}

function pruneOldLogs(dir: string, dryRun: boolean): Reclaimed {
  const out: Reclaimed = { what: `run logs older than ${LOG_MAX_AGE_DAYS} days`, bytes: 0, count: 0 }
  if (!existsSync(dir)) return out

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.log')) continue
    const file = join(dir, name)
    try {
      if (ageInDays(file) <= LOG_MAX_AGE_DAYS) continue
      out.bytes += statSync(file).size
      out.count++
      if (!dryRun) unlinkSync(file)
    } catch {
      /* vanished under us — fine */
    }
  }
  return out
}

/**
 * Delete local run branches whose work has already landed.
 *
 * Merged into the default branch is the only safe signal available offline. An
 * unmerged branch is somebody's unreviewed work and is never touched, however
 * old it looks.
 */
async function pruneMergedRunBranches(cwd: string, dryRun: boolean): Promise<Reclaimed> {
  const out: Reclaimed = { what: 'merged circon/run-* branches', bytes: 0, count: 0 }

  const isRepo = await run('git', ['rev-parse', '--git-dir'], { cwd })
  if (!isRepo.ok) return out

  const current = (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })).stdout.trim()
  const base =
    (await run('git', ['rev-parse', '--verify', 'main'], { cwd })).ok ? 'main' : 'master'

  const merged = await run('git', ['branch', '--merged', base, '--format=%(refname:short)'], { cwd })
  if (!merged.ok) return out

  for (const branch of merged.stdout.split('\n').map((b) => b.trim()).filter(Boolean)) {
    if (!branch.startsWith('circon/run-')) continue
    if (branch === current) continue
    out.count++
    if (!dryRun) await run('git', ['branch', '-d', branch], { cwd })
  }
  return out
}

function pruneProjectLogs(cwd: string, dryRun: boolean): Reclaimed {
  const out: Reclaimed = { what: 'project .circon/*.log', bytes: 0, count: 0 }
  const dir = join(cwd, '.circon')
  if (!existsSync(dir)) return out

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.log')) continue
    const file = join(dir, name)
    try {
      out.bytes += statSync(file).size
      out.count++
      if (!dryRun) unlinkSync(file)
    } catch {
      /* ignore */
    }
  }
  return out
}

async function prunePnpmStore(dryRun: boolean): Promise<Reclaimed> {
  const out: Reclaimed = { what: 'pnpm store', bytes: 0, count: 0 }
  if (!(await which('pnpm'))) return out

  const pathResult = await run('pnpm', ['store', 'path'])
  const store = pathResult.stdout.trim()
  if (!pathResult.ok || !store || !existsSync(store)) return out

  const du = await run('du', ['-sk', store], { timeoutMs: 60_000 })
  const kb = Number.parseInt(du.stdout.trim().split(/\s+/)[0] ?? '0', 10)
  const gb = kb / 1024 / 1024
  if (!Number.isFinite(gb) || gb < PNPM_STORE_LIMIT_GB) return out

  out.count = 1
  if (!dryRun) {
    // `store prune` only removes packages no lockfile references.
    await run('pnpm', ['store', 'prune'], { timeoutMs: 300_000 })
    const after = await run('du', ['-sk', store], { timeoutMs: 60_000 })
    const afterKb = Number.parseInt(after.stdout.trim().split(/\s+/)[0] ?? '0', 10)
    out.bytes = Math.max(0, (kb - afterKb) * 1024)
  }
  return out
}

/** Orphaned lock and temp files from runs that were killed. */
function pruneStaleState(dryRun: boolean): Reclaimed {
  const out: Reclaimed = { what: 'stale temp files', bytes: 0, count: 0 }
  if (!existsSync(paths.state)) return out

  for (const name of readdirSync(paths.state)) {
    if (!name.startsWith('.test-output.') && !name.endsWith('.tmp')) continue
    const file = join(paths.state, name)
    try {
      if (ageInDays(file) < 1) continue
      out.bytes += statSync(file).size
      out.count++
      if (!dryRun) rmSync(file, { force: true })
    } catch {
      /* ignore */
    }
  }
  return out
}

export async function collect(opts: GcOptions = {}): Promise<Reclaimed[]> {
  const dryRun = opts.dryRun ?? false
  const results: Reclaimed[] = [
    pruneOldLogs(paths.logs, dryRun),
    pruneStaleState(dryRun),
  ]

  if (opts.cwd) {
    results.push(pruneProjectLogs(opts.cwd, dryRun))
    results.push(await pruneMergedRunBranches(opts.cwd, dryRun))
  }
  results.push(await prunePnpmStore(dryRun))

  return results.filter((r) => r.count > 0)
}

export async function gcCommand(opts: GcOptions = {}): Promise<number> {
  ui.heading(opts.dryRun ? 'circon gc (dry run)' : 'circon gc')

  const results = await collect({ ...opts, cwd: opts.cwd ?? process.cwd() })

  if (results.length === 0) {
    ui.ok('Nothing worth reclaiming.')
    return 0
  }

  let total = 0
  for (const r of results) {
    total += r.bytes
    ui.info(`  ${r.count} × ${r.what}${r.bytes ? ` — ${human(r.bytes)}` : ''}`)
  }

  ui.blank()
  ui.ok(
    opts.dryRun
      ? `Would reclaim about ${human(total)}. Run without --dry-run to do it.`
      : `Reclaimed about ${human(total)}.`,
  )
  ui.dim('Never touched: Ollama models, Docker volumes, referenced packages.')
  return 0
}
