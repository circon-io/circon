import {
  existsSync, mkdirSync, writeFileSync, chmodSync, readFileSync, readdirSync, statSync, appendFileSync,
} from 'node:fs'
import { join, dirname, basename, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { run, which } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { paths, projectPaths } from '../core/paths.ts'

/**
 * Scaffold a project from the template: a pnpm monorepo holding its own clients
 * and services, wired to the gate.
 *
 * Two entry points. `circon init <name>` makes a new directory under
 * ~/Projects. `circon init --here`, and a runner's first job on a freshly
 * connected repository, scaffold into a checkout that already exists — where
 * the approved PRD.md already lives, so nothing that exists is overwritten.
 */

export function templatesDir(): string {
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

export interface ScaffoldVars {
  /** npm-safe project name: the workspace root's package name. */
  name: string
  /** Reverse-DNS app identifier for the stores, e.g. com.acme.shop. */
  bundleId: string
}

/** Lowercase, dash-separated, safe for npm, Workers and directory names. */
export function safeName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app'
}

/** `acme__shop-app` → com.acme.shopapp. Store ids allow letters and digits per segment. */
export function bundleIdFor(owner: string, name: string): string {
  const segment = (s: string) => {
    const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '')
    return /^[a-z]/.test(clean) ? clean : `app${clean}`
  }
  return `com.${segment(owner)}.${segment(name)}`
}

/** Template files carry these tokens; everything else is copied verbatim. */
const TOKENS = (vars: ScaffoldVars): Array<[string, string]> => [
  ['__PROJECT_NAME__', vars.name],
  ['__BUNDLE_ID__', vars.bundleId],
]

const BINARY = /\.(png|jpe?g|gif|ico|webp|ttf|otf|woff2?)$/i

/**
 * Copy the template into `target` without overwriting anything, substituting
 * tokens on the way. Returns the files it wrote, relative to `target`.
 */
export function scaffold(target: string, vars: ScaffoldVars, templates = templatesDir()): string[] {
  const written: string[] = []
  const tokens = TOKENS(vars)

  const walk = (from: string) => {
    for (const entry of readdirSync(from)) {
      const source = join(from, entry)
      let rel = relative(templates, source)
      // npm strips every `.gitignore` from a published tarball, so the template
      // ships it under a name npm leaves alone and it is restored here.
      if (rel === 'gitignore') rel = '.gitignore'
      const dest = join(target, rel)

      if (statSync(source).isDirectory()) {
        mkdirSync(dest, { recursive: true })
        walk(source)
        continue
      }

      if (existsSync(dest)) {
        // An existing .gitignore gains the template's lines it lacks; any other
        // existing file is the project's own and is left exactly as it is.
        if (rel === '.gitignore') {
          const have = new Set(readFileSync(dest, 'utf8').split('\n').map((l) => l.trim()))
          const missing = readFileSync(source, 'utf8').split('\n').filter((l) => l.trim() && !have.has(l.trim()))
          if (missing.length) appendFileSync(dest, `\n# added by circon\n${missing.join('\n')}\n`)
        }
        continue
      }

      mkdirSync(dirname(dest), { recursive: true })
      if (BINARY.test(entry)) {
        writeFileSync(dest, readFileSync(source))
      } else {
        let text = readFileSync(source, 'utf8')
        for (const [token, value] of tokens) text = text.split(token).join(value)
        writeFileSync(dest, text)
      }
      if (source.endsWith('.sh')) chmodSync(dest, 0o755)
      written.push(rel)
    }
  }
  walk(templates)

  // Name the workspace root after the project, unless it already had a name.
  const pkgPath = join(target, 'package.json')
  if (written.includes('package.json')) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    pkg['name'] = vars.name
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }

  if (!existsSync(join(target, 'progress.txt'))) {
    writeFileSync(join(target, 'progress.txt'), '')
    written.push('progress.txt')
  }

  // The conventions clone is the source of truth for the PRD template, so a
  // convention change reaches new projects without a CLI release. Never over
  // an existing PRD: on a connected repository that is the approved plan.
  const conventionPrd = join(paths.conventions, 'templates', 'PRD.md')
  if (!existsSync(join(target, 'PRD.md')) && existsSync(conventionPrd)) {
    writeFileSync(join(target, 'PRD.md'), readFileSync(conventionPrd))
    written.push('PRD.md')
  }
  return written
}

/** Install dependencies so the gate's typecheck and test tiers have their tools. */
export async function installDependencies(target: string): Promise<void> {
  if (await which('pnpm')) {
    ui.step('Installing workspace dependencies…')
    await run('pnpm', ['install'], { cwd: target, stream: true })
  }
}

/**
 * For a runner's first job on a connected repository: scaffold into the
 * checkout if it has never been scaffolded. The caller commits the result on
 * the run branch, so the scaffold reaches the default branch through the run's
 * pull request like everything else.
 */
export async function scaffoldIfMissing(dir: string, slug: string): Promise<boolean> {
  if (existsSync(join(dir, projectPaths.dir))) return false
  const [owner = 'app', repo = basename(dir)] = slug.split('__')
  ui.step('First run on this repository — scaffolding it from the circon template…')
  const written = scaffold(dir, { name: safeName(repo), bundleId: bundleIdFor(owner, repo) })
  ui.ok(`Scaffolded ${written.length} files.`)
  await installDependencies(dir)
  return true
}

export async function initCommand(args: string[] = []): Promise<number> {
  const here = args.includes('--here')
  const nameArg = args.find((a) => !a.startsWith('--'))

  if (here) {
    const target = process.cwd()
    if (existsSync(join(target, projectPaths.dir))) {
      ui.error('This directory is already a circon project (.circon/ exists).')
      return 1
    }
    const name = safeName(nameArg ?? basename(target))
    ui.heading(`circon init --here — ${name}`)
    const written = scaffold(target, { name, bundleId: bundleIdFor('app', name) })
    ui.ok(`Added ${written.length} files; nothing that existed was changed.`)
    await installDependencies(target)
    ui.info("  Review with 'git status', then commit.")
    return 0
  }

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

  const templates = templatesDir()
  if (!existsSync(templates)) {
    ui.error(`Templates not found at ${templates}. Reinstall @circon/cli.`)
    return 1
  }

  ui.heading(`circon init — ${name}`)
  mkdirSync(target, { recursive: true })
  scaffold(target, { name, bundleId: bundleIdFor('app', name) }, templates)
  if (!existsSync(join(target, 'PRD.md'))) {
    ui.warn('No PRD template found — the conventions repo is not cloned.')
    ui.dim("  Run 'circon setup --only conventions', then write PRD.md by hand.")
  }
  ui.ok(`Created ${target}`)

  await installDependencies(target)

  await run('git', ['init', '-q', '-b', 'main'], { cwd: target })
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
