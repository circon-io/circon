import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { run, which } from '../core/exec.ts'
import { paths } from '../core/paths.ts'
import { readConfig } from '../core/config.ts'
import { type Component, ok, missing, currentPlatform, EVERYWHERE } from './types.ts'
import { isEnrolled } from '../agent/control-plane.ts'

export const DEFAULT_CONVENTIONS_REPO = 'https://github.com/circon-io/circon-conventions.git'

export const workspaceComponent: Component = {
  id: 'workspace',
  summary: 'Project and workspace directories',
  platforms: EVERYWHERE,

  async check() {
    const wanted = [paths.projects, paths.workspace, paths.config, paths.state]
    const absent = wanted.filter((d) => !existsSync(d))
    return absent.length === 0 ? ok('all present') : missing(`${absent.length} missing`)
  },

  async install() {
    // One directory per project under ~/Projects; each project is a monorepo
    // holding its own clients and services, so nothing is categorized here.
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
  platforms: EVERYWHERE,
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
  platforms: ['linux'],

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

const LAUNCHD_LABEL = 'io.circon.agent'
const launchdPlist = () => join(process.env['HOME'] ?? '', 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
const launchdDomain = () => `gui/${process.getuid?.() ?? 501}`

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A LaunchAgent: started at login, restarted if it dies, PATH captured at install. */
export function launchdPlistXml(bin: string, logDir: string, path: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(bin)}</string><string>agent</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${xml(path)}</string></dict>
  <key>StandardOutPath</key><string>${xml(join(logDir, 'agent.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(join(logDir, 'agent.log'))}</string>
</dict>
</plist>
`
}

/**
 * The agent daemon as a user service, so an enrolled runner comes back after a
 * reboot without anyone logging in.
 *
 * `--user` rather than a system unit because the agent needs the user's
 * `~/.config/circon`, git identity, SSH agent and Android SDK — a system unit
 * would need every one of those re-specified, and would run the agent as a
 * different user than the one whose checkouts it works on. `enable-linger` is
 * what makes a user service start at boot with nobody logged in.
 *
 * `check()` reports ok on an unenrolled machine: a runner with no control plane
 * has nothing to poll, and reporting `missing` would make `doctor` red for a
 * standalone install that is working exactly as intended.
 */
export const agentServiceComponent: Component = {
  id: 'agent-service',
  summary: 'Agent daemon at boot (systemd --user, launchd on macOS)',
  platforms: EVERYWHERE,
  requires: ['workspace'],

  async check() {
    if (!isEnrolled()) return ok('not enrolled — nothing to run')
    if (currentPlatform() === 'darwin') {
      if (!existsSync(launchdPlist())) return missing('LaunchAgent not installed')
      const loaded = await run('launchctl', ['print', `${launchdDomain()}/${LAUNCHD_LABEL}`])
      return loaded.ok && /state = running/.test(loaded.stdout) ? ok('running') : missing('installed but not running')
    }
    const enabled = await run('systemctl', ['--user', 'is-enabled', 'circon-agent.service'])
    if (!enabled.ok) return missing('not enabled')
    // Enabled but dead is the failure that matters: jobs queue up and nothing
    // ever claims them, with no error anywhere.
    const active = await run('systemctl', ['--user', 'is-active', 'circon-agent.service'])
    return active.ok ? ok('running') : missing('enabled but not running')
  },

  async install() {
    if (!isEnrolled()) return
    const bin = (await which('circon')) ?? 'circon'

    if (currentPlatform() === 'darwin') {
      // A LaunchAgent rather than a LaunchDaemon, for the same reason Linux uses
      // a user unit: the agent needs this user's config, keychain, SDKs and
      // simulators. launchd gives it no shell, so PATH is captured now.
      mkdirSync(join(process.env['HOME'] ?? '', 'Library', 'LaunchAgents'), { recursive: true })
      mkdirSync(paths.logs, { recursive: true })
      writeFileSync(launchdPlist(), launchdPlistXml(bin, paths.logs, process.env['PATH'] ?? '/usr/bin:/bin'))
      await run('launchctl', ['bootout', `${launchdDomain()}/${LAUNCHD_LABEL}`])
      const loaded = await run('launchctl', ['bootstrap', launchdDomain(), launchdPlist()])
      if (!loaded.ok) throw new Error(`launchctl bootstrap failed: ${loaded.stderr.trim()}`)
      return
    }

    const unitDir = join(process.env['HOME'] ?? '', '.config', 'systemd', 'user')
    mkdirSync(unitDir, { recursive: true })

    // Restart=always with a delay: the daemon's own loop tolerates an
    // unreachable control plane, so a crash here means something unexpected and
    // retrying slowly is better than a restart loop burning the journal.
    writeFileSync(
      join(unitDir, 'circon-agent.service'),
      [
        '[Unit]',
        'Description=circon agent — claims and runs queued jobs',
        'After=network-online.target',
        '',
        '[Service]',
        'Type=simple',
        `ExecStart=${bin} agent`,
        'Restart=always',
        'RestartSec=30',
        // A run can last hours; stopping must let it finish the iteration.
        'TimeoutStopSec=300',
        '',
        '[Install]',
        'WantedBy=default.target',
        '',
      ].join('\n'),
    )

    await run('systemctl', ['--user', 'daemon-reload'])
    const enable = await run('systemctl', ['--user', 'enable', '--now', 'circon-agent.service'])
    if (!enable.ok) throw new Error('could not enable the agent service (no user session bus?)')
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
