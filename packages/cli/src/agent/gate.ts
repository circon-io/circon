import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { run, which } from '../core/exec.ts'
import { readConfig } from '../core/config.ts'
import { projectPaths } from '../core/paths.ts'

/**
 * The tiered quality gate: cheapest signal first, stop at the first failure.
 *
 * Every tier is opt-in by file presence, so a project with none of them behaves
 * exactly as a bare `npm test` would. That property is load-bearing — it is what
 * lets the gate be turned on for one project without disturbing any other.
 */

export type TierName = 'typecheck' | 'unit tests' | 'web UI' | 'android UI' | 'ios UI'

export interface GateResult {
  ok: boolean
  /** The tier that failed, or null when everything passed or nothing ran. */
  failedTier: TierName | null
  /** Combined output of whatever ran, for the alert and the next prompt. */
  output: string
  ranTiers: TierName[]
}

export interface GateDeps {
  cwd: string
  /** Injected so tests can drive the tiers without a real toolchain. */
  exec?: (cmd: string, args: string[], cwd: string) => Promise<{ ok: boolean; output: string }>
  hasBinary?: (name: string) => Promise<boolean>
  fileExists?: (path: string) => boolean
  readFile?: (path: string) => string
}

interface Tier {
  name: TierName
  applies: () => Promise<boolean> | boolean
  execute: () => Promise<{ ok: boolean; output: string }>
}

const defaultExec = async (cmd: string, args: string[], cwd: string) => {
  const r = await run(cmd, args, { cwd })
  return { ok: r.ok, output: `${r.stdout}${r.stderr}` }
}

export async function runGate(deps: GateDeps): Promise<GateResult> {
  const cwd = deps.cwd
  const exec = deps.exec ?? defaultExec
  const hasBinary = deps.hasBinary ?? (async (n: string) => Boolean(await which(n)))
  const fileExists = deps.fileExists ?? ((p: string) => existsSync(join(cwd, p)))
  const readFile = deps.readFile ?? ((p: string) => readFileSync(join(cwd, p), 'utf8'))

  const packageJson = (): Record<string, unknown> | null => {
    if (!fileExists('package.json')) return null
    try {
      return JSON.parse(readFile('package.json')) as Record<string, unknown>
    } catch {
      return null
    }
  }

  const packageManager = (): string =>
    fileExists('pnpm-workspace.yaml') || fileExists('pnpm-lock.yaml') ? 'pnpm' : 'npm'

  const flow = (name: string) => join(projectPaths.flows, name)

  const tiers: Tier[] = [
    {
      name: 'typecheck',
      // Only when a local tsc actually exists — never download one mid-loop.
      applies: () => fileExists('tsconfig.json') && fileExists('node_modules/.bin/tsc'),
      execute: () => exec('node_modules/.bin/tsc', ['--noEmit'], cwd),
    },
    {
      name: 'unit tests',
      applies: () => {
        const pkg = packageJson()
        const scripts = pkg?.['scripts'] as Record<string, string> | undefined
        return Boolean(scripts?.['test'])
      },
      execute: () => exec(packageManager(), ['test'], cwd),
    },
    {
      name: 'web UI',
      applies: async () => fileExists(flow('web.sh')) && (await hasBinary('agent-device')),
      execute: () => exec('bash', [flow('web.sh')], cwd),
    },
    {
      name: 'android UI',
      applies: async () => {
        if (!fileExists(flow('android.sh')) || !(await hasBinary('agent-device'))) return false
        const devices = await exec('adb', ['devices'], cwd)
        return /\bdevice\s*$/m.test(devices.output)
      },
      execute: () => exec('bash', [flow('android.sh')], cwd),
    },
    {
      name: 'ios UI',
      applies: () =>
        fileExists(flow('ios.sh')) && readConfig().iosRunnerMode !== 'none',
      execute: () => exec('bash', [flow('ios.sh')], cwd),
    },
  ]

  const ran: TierName[] = []
  let output = ''

  for (const tier of tiers) {
    if (!(await tier.applies())) continue
    ran.push(tier.name)
    const result = await tier.execute()
    output += result.output
    if (!result.ok) {
      return { ok: false, failedTier: tier.name, output, ranTiers: ran }
    }
  }

  return { ok: true, failedTier: null, output, ranTiers: ran }
}
