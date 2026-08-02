import { existsSync, mkdirSync, writeFileSync, cpSync, chmodSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { run, which } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { paths, projectPaths } from '../core/paths.ts'

/**
 * Scaffold a project: one directory under ~/Projects, a pnpm monorepo holding
 * its own clients and services. Nothing is categorised above the project, so a
 * repo never has to live in two trees.
 */

function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // dist/commands/init.js → package root → templates
  return join(here, '..', '..', 'templates')
}

async function prompt(question: string, fallback: string): Promise<string> {
  if (!process.stdin.isTTY) return fallback
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = (await rl.question(`  ${question} [${fallback}]: `)).trim()
    return answer || fallback
  } finally {
    rl.close()
  }
}

export async function initCommand(nameArg?: string): Promise<number> {
  const name = nameArg ?? (await prompt('Project name', 'my-thing'))
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    ui.error('Project name must be lowercase letters, digits and dashes.')
    return 1
  }

  const target = join(paths.projects, name)
  if (existsSync(target)) {
    ui.error(`${target} already exists.`)
    return 1
  }

  ui.heading(`circon init — ${name}`)

  const templates = templatesDir()
  if (!existsSync(templates)) {
    ui.error(`Templates not found at ${templates}. Reinstall @circon/cli.`)
    return 1
  }

  mkdirSync(target, { recursive: true })
  cpSync(templates, target, { recursive: true })

  // Name the workspace root after the project.
  const pkgPath = join(target, 'package.json')
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    pkg['name'] = name
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }

  for (const flow of ['web.sh', 'android.sh']) {
    const p = join(target, projectPaths.flows, flow)
    if (existsSync(p)) chmodSync(p, 0o755)
  }
  writeFileSync(join(target, 'progress.txt'), '')

  // The conventions clone is the source of truth for the PRD template, so a
  // convention change reaches new projects without a CLI release. Say so loudly
  // when it is absent — a project with no PRD gives the loop nothing to work
  // from, and the failure would otherwise only surface at `circon run`.
  const conventionPrd = join(paths.conventions, 'templates', 'PRD.md')
  if (existsSync(conventionPrd)) {
    cpSync(conventionPrd, join(target, 'PRD.md'))
  } else {
    ui.warn('No PRD template found — the conventions repo is not cloned.')
    ui.dim("  Run 'circon setup --only conventions', then write PRD.md by hand.")
  }

  ui.ok(`Created ${target}`)

  const wantsClient = process.stdin.isTTY
    ? (await prompt('Add an Expo client at apps/mobile? (y/N)', 'N')).toLowerCase().startsWith('y')
    : false

  if (wantsClient && (await which('npx'))) {
    ui.step('Creating the Expo client…')
    const created = await run('npx', ['--yes', 'create-expo-app@latest', 'mobile'], {
      cwd: join(target, 'apps'),
      stream: true,
    })
    if (created.ok) {
      // react-native-web is what makes the fast web feedback loop possible.
      await run(
        'npx',
        ['--yes', 'expo', 'install', 'react-dom', 'react-native-web', '@expo/metro-runtime'],
        { cwd: join(target, 'apps', 'mobile'), stream: true },
      )
    } else {
      ui.warn('create-expo-app failed — the monorepo is still usable.')
    }
  }

  if (await which('pnpm')) {
    ui.step('Installing workspace dependencies…')
    await run('pnpm', ['install'], { cwd: target, stream: true })
  }

  await run('git', ['init', '-q'], { cwd: target })
  await run('git', ['add', '-A'], { cwd: target })
  await run(
    'git',
    ['-c', 'user.name=AI Developer', '-c', 'user.email=ai@localhost',
     'commit', '-qm', 'chore: scaffold monorepo wired to the circon gate'],
    { cwd: target },
  )

  ui.blank()
  ui.ok('Ready.')
  ui.info(`  cd ${target}`)
  ui.info('  $EDITOR PRD.md      # fill in Design Principles and User Flows')
  ui.info('  circon run')
  return 0
}
