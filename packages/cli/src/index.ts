#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { ui } from './core/ui.ts'
import { doctorCommand } from './commands/doctor.ts'
import { setupCommand } from './commands/setup.ts'

const USAGE = `circon — autonomous AI development runner

Machine
  circon doctor                    what is installed, missing, stale or foreign
  circon setup [--upgrade]         install only what is missing (idempotent)
       --only <id>                 converge a single component
       --dry-run                   report what would change, change nothing
  circon config                    set credentials (Anthropic, Telegram, RDP)
  circon update                    pull the shared conventions repository

Projects
  circon init [name]               scaffold a monorepo wired to the gate
  circon run [maxLoops]            run the agent loop in the current project
  circon status                    tasks done and open in this project
  circon stop                      stop the running loop between iterations
  circon verify [reason]           Claude Code review of the recent diff

Reporting
  circon report [--stdout]         daily digest
  circon gc [--dry-run]            reclaim disk: old logs, merged run branches

  circon --version
`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE)
    return 0
  }

  if (command === '--version' || command === '-v') {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { join, dirname } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      version: string
    }
    console.log(pkg.version)
    return 0
  }

  switch (command) {
    case 'doctor':
      return doctorCommand()

    case 'setup': {
      const { values } = parseArgs({
        args: rest,
        options: {
          upgrade: { type: 'boolean', default: false },
          only: { type: 'string' },
          'dry-run': { type: 'boolean', default: false },
        },
        allowPositionals: false,
      })
      return setupCommand({
        upgrade: values.upgrade ?? false,
        dryRun: values['dry-run'] ?? false,
        ...(values.only ? { only: values.only } : {}),
      })
    }

    case 'config': {
      const { configCommand } = await import('./commands/config.ts')
      return configCommand()
    }

    case 'update': {
      const { updateCommand } = await import('./commands/update.ts')
      return updateCommand()
    }

    case 'init': {
      const { initCommand } = await import('./commands/init.ts')
      return initCommand(rest[0])
    }

    case 'run': {
      const { runCommand } = await import('./commands/run.ts')
      const maxLoops = rest[0] ? parseInt(rest[0], 10) : undefined
      return runCommand(maxLoops)
    }

    case 'stop': {
      const { stopCommand } = await import('./commands/stop.ts')
      return stopCommand()
    }

    case 'verify': {
      const { verifyCommand } = await import('./commands/verify.ts')
      return verifyCommand(rest.join(' ') || 'manual review')
    }

    case 'report': {
      const { reportCommand } = await import('./commands/report.ts')
      return reportCommand({ stdout: rest.includes('--stdout') })
    }

    case 'gc': {
      const { gcCommand } = await import('./commands/gc.ts')
      return gcCommand({ dryRun: rest.includes('--dry-run') })
    }

    case 'status': {
      const { statusCommand } = await import('./commands/status.ts')
      return statusCommand()
    }

    default:
      ui.error(`Unknown command: ${command}`)
      console.log(USAGE)
      return 1
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    ui.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
