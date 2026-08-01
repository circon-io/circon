import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { run, which } from '../core/exec.ts'
import { paths } from '../core/paths.ts'
import { readConfig } from '../core/config.ts'
import { type Component, ok, missing } from './types.ts'

export const DEFAULT_CONVENTIONS_REPO = 'https://github.com/circon-dev/circon-conventions.git'

export const workspaceComponent: Component = {
  id: 'workspace',
  summary: 'Project and workspace directories',

  async check() {
    const wanted = [paths.projects, paths.workspace, paths.config, paths.state]
    const absent = wanted.filter((d) => !existsSync(d))
    return absent.length === 0 ? ok('all present') : missing(`${absent.length} missing`)
  },

  async install() {
    // One directory per project under ~/Projects; each project is a monorepo
    // holding its own clients and services, so nothing is categorised here.
    for (const dir of [paths.projects, paths.workspace, paths.config, paths.state, paths.logs]) {
      mkdirSync(dir, { recursive: true })
    }
  },
}

/**
 * Conventions live in git so they can be edited on GitHub, reviewed as a PR and
 * shared across machines. The runner only ever pulls — and only at run start,
 * never mid-loop.
 */
export const conventionsComponent: Component = {
  id: 'conventions',
  summary: 'Shared engineering conventions (git clone)',
  requires: ['workspace'],

  async check() {
    if (!existsSync(paths.conventions)) return missing('not cloned')
    if (!existsSync(join(paths.conventions, '.git'))) return missing('present but not a git repo')

    const architecture = join(paths.conventions, 'ARCHITECTURE.md')
    if (!existsSync(architecture)) return missing('clone has no ARCHITECTURE.md')

    const rev = await run('git', ['-C', paths.conventions, 'rev-parse', '--short', 'HEAD'])
    return ok(`at ${rev.stdout.trim() || 'unknown'}`)
  },

  async install() {
    const cfg = readConfig()
    const repo = cfg.conventionsRepo ?? DEFAULT_CONVENTIONS_REPO
    mkdirSync(paths.workspace, { recursive: true })

    const r = await run('git', ['clone', '--depth', '1', repo, paths.conventions], {
      stream: true,
    })
    if (!r.ok) {
      // A missing conventions repo must not block the machine. Seed a local one
      // so the loop still has a contract to follow, and say so plainly.
      mkdirSync(paths.conventions, { recursive: true })
      writeFileSync(
        join(paths.conventions, 'ARCHITECTURE.md'),
        SEED_CONVENTIONS,
      )
      await run('git', ['-C', paths.conventions, 'init', '-q'])
      throw new Error(
        `could not clone ${repo} — seeded a local ARCHITECTURE.md instead. ` +
          `Set conventionsRepo in ${join(paths.config, 'config.json')} and re-run.`,
      )
    }
  },
}

export const dailyReportComponent: Component = {
  id: 'daily-report',
  summary: 'Daily digest timer (systemd --user)',
  linuxOnly: true,

  async check() {
    const r = await run('systemctl', ['--user', 'is-enabled', 'circon-report.timer'])
    return r.ok ? ok('enabled') : missing('not enabled')
  },

  async install() {
    const unitDir = join(process.env['HOME'] ?? '', '.config', 'systemd', 'user')
    mkdirSync(unitDir, { recursive: true })

    const bin = (await which('circon')) ?? 'circon'
    writeFileSync(
      join(unitDir, 'circon-report.service'),
      `[Unit]\nDescription=circon daily activity report\n\n[Service]\nType=oneshot\nExecStart=${bin} report\n`,
    )
    writeFileSync(
      join(unitDir, 'circon-report.timer'),
      `[Unit]\nDescription=Send the circon daily activity report\n\n[Timer]\nOnCalendar=*-*-* 20:00:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n`,
    )

    await run('systemctl', ['--user', 'daemon-reload'])
    const enable = await run('systemctl', ['--user', 'enable', '--now', 'circon-report.timer'])
    if (!enable.ok) throw new Error('could not enable the report timer (no user session bus?)')
    await run('sudo', ['loginctl', 'enable-linger', process.env['USER'] ?? ''])
  },
}

const SEED_CONVENTIONS = `# Engineering Conventions

This file was seeded locally because the conventions repository could not be
cloned. Replace it by pointing \`conventionsRepo\` at a real repository and
running \`circon setup --only conventions\`.

## Working discipline

- One task per iteration.
- Never weaken a check to make it pass.
- Design before code.
`

export function readConventions(): string | null {
  const file = join(paths.conventions, 'ARCHITECTURE.md')
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}
