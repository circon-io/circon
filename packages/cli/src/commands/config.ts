import { createInterface } from 'node:readline/promises'
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { ui } from '../core/ui.ts'
import { writeEnvFile, readEnvFile, writeConfig, readConfig } from '../core/config.ts'
import { paths } from '../core/paths.ts'
import { run, which } from '../core/exec.ts'
import { currentPlatform } from '../components/types.ts'
import { appleKey, xtoolLoginInput } from '../components/apple.ts'

/**
 * Every credential the machine needs, asked once. Existing values are shown as
 * "already set" and kept on a blank answer, so re-running is safe and cheap.
 */
async function ask(rl: ReturnType<typeof createInterface>, prompt: string, current?: string) {
  const suffix = current ? ' [already set — Enter to keep]' : ''
  const answer = (await rl.question(`  ${prompt}${suffix}: `)).trim()
  return answer || current || ''
}

export async function configCommand(): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    ui.heading('circon config')
    ui.dim(`Credentials are written to ${paths.config} at mode 0600.`)

    const anthropic = readEnvFile('anthropic')
    const cfg = readConfig()

    ui.blank()
    ui.info('Anthropic — an API key (aider, and Claude Code without a subscription)')
    const key = await ask(rl, 'API key, Enter to skip', anthropic['ANTHROPIC_API_KEY'])

    ui.blank()
    ui.info('Claude Code subscription — billed to your Pro/Max plan instead of per token')
    ui.dim("  Run 'claude setup-token' in another terminal (it opens a browser once and")
    ui.dim('  prints a token valid for a year), then paste it here. Enter to skip.')
    ui.dim('  When both are set, circon keeps the API key away from Claude Code so the')
    ui.dim('  subscription is what pays.')
    const oauth = await ask(rl, 'Claude Code token', anthropic['CLAUDE_CODE_OAUTH_TOKEN'])

    const anthropicEntries: Record<string, string> = {}
    if (key) anthropicEntries['ANTHROPIC_API_KEY'] = key
    if (oauth) anthropicEntries['CLAUDE_CODE_OAUTH_TOKEN'] = oauth
    if (Object.keys(anthropicEntries).length) {
      writeEnvFile('anthropic', anthropicEntries, 'Anthropic credentials')
    }

    ui.blank()
    ui.info('OpenAI Codex — Enter to skip')
    ui.dim("  For a ChatGPT plan, log in once with 'codex login --device-auth'; Codex keeps")
    ui.dim('  that login itself. An API key here is only needed to bill the API instead.')
    const openai = readEnvFile('openai')
    const openaiKey = await ask(rl, 'OpenAI API key', openai['OPENAI_API_KEY'])
    if (openaiKey && openaiKey !== openai['OPENAI_API_KEY']) {
      writeEnvFile('openai', { OPENAI_API_KEY: openaiKey }, 'OpenAI credentials')
      // Codex keeps its own credential store; hand it the key on stdin so it never
      // appears in a process list.
      if (await which('codex')) {
        const login = await run('codex', ['login', '--with-api-key'], { input: openaiKey })
        if (login.ok) ui.ok('Codex logged in with the API key.')
        else ui.warn("Codex did not accept the key — run 'codex login' by hand.")
      }
    }

    ui.blank()
    ui.info('Project credentials — used by scaffolded projects, Enter to skip')
    ui.dim('  Cloudflare tokens must be scoped to one account and only the')
    ui.dim('  resources that project needs. Never a global API key.')
    const project = readEnvFile('project')
    const cfToken = await ask(rl, 'Cloudflare API token', project['CLOUDFLARE_API_TOKEN'])
    const cfAccount = await ask(rl, 'Cloudflare account ID', project['CLOUDFLARE_ACCOUNT_ID'])
    const ghToken = await ask(rl, 'GitHub token (repo + workflow)', project['GITHUB_TOKEN'])
    const clerk = await ask(rl, 'Clerk secret key', project['CLERK_SECRET_KEY'])
    const sentry = await ask(rl, 'Sentry auth token', project['SENTRY_AUTH_TOKEN'])
    const entries: Record<string, string> = {}
    if (cfToken) entries['CLOUDFLARE_API_TOKEN'] = cfToken
    if (cfAccount) entries['CLOUDFLARE_ACCOUNT_ID'] = cfAccount
    if (ghToken) entries['GITHUB_TOKEN'] = ghToken
    if (clerk) entries['CLERK_SECRET_KEY'] = clerk
    if (sentry) entries['SENTRY_AUTH_TOKEN'] = sentry
    if (Object.keys(entries).length) {
      writeEnvFile('project', entries, 'Project credentials (mode 0600)')
      ui.ok(`Saved ${Object.keys(entries).length} project credential(s).`)
    }

    if (currentPlatform() === 'linux') await askAppleKey(rl)

    ui.blank()
    ui.info('Conventions repository — Enter to keep the default')
    const repo = await ask(rl, 'Git URL', cfg.conventionsRepo)
    if (repo) writeConfig({ conventionsRepo: repo })

    ui.blank()
    ui.ok('Configuration saved.')
    ui.dim("Run 'circon setup' to converge the machine.")
    return 0
  } finally {
    rl.close()
  }
}

/**
 * The App Store Connect API key xtool signs with, for a USB iPhone on a Linux
 * runner. The .p8 is copied next to the other credentials, so a key left in
 * ~/Downloads can be cleaned up without breaking the next login.
 */
async function askAppleKey(rl: ReturnType<typeof createInterface>): Promise<void> {
  ui.blank()
  ui.info('Apple — an App Store Connect API key, for testing on a USB iPhone. Enter to skip')
  ui.dim('  App Store Connect → Users and Access → Integrations → Team Keys, role App')
  ui.dim('  Manager. xtool uses it to register the phone and sign the dev client.')
  const current = appleKey()
  const keyId = await ask(rl, 'Key ID', current?.keyId)
  if (!keyId) return
  const issuerId = await ask(rl, 'Issuer ID', current?.issuerId)
  const given = await ask(rl, 'Path to the .p8 file', current?.keyPath)
  if (!issuerId || !given) {
    ui.warn('Key ID, issuer ID and the .p8 are all needed — skipped.')
    return
  }
  const source = resolve(given.replace(/^~(?=\/|$)/, homedir()))
  if (!existsSync(source)) {
    ui.warn(`${source} does not exist — skipped.`)
    return
  }
  mkdirSync(paths.config, { recursive: true })
  const keyPath = join(paths.config, 'apple-asc-key.p8')
  if (source !== keyPath) copyFileSync(source, keyPath)
  chmodSync(keyPath, 0o600)
  const key = { keyId, issuerId, keyPath }
  writeEnvFile('apple', { APPLE_ASC_KEY_ID: keyId, APPLE_ASC_ISSUER_ID: issuerId, APPLE_ASC_KEY_PATH: keyPath }, 'App Store Connect API key (mode 0600)')

  // Hand it to xtool now if it is installed; otherwise `circon setup` will.
  const xtool = existsSync(join(paths.bin, 'xtool')) ? join(paths.bin, 'xtool') : await which('xtool')
  if (!xtool) return
  const changed = current?.keyId !== keyId || current?.issuerId !== issuerId
  if (changed) await run(xtool, ['auth', 'logout'])
  const login = await run(xtool, ['auth', 'login', '--mode', 'key'], { input: xtoolLoginInput(key), timeoutMs: 120_000 })
  if (/^Logged in/m.test(login.stdout)) ui.ok('xtool logged in with the App Store Connect key.')
  else ui.warn("xtool did not accept the key — check it, then run 'circon setup --only xtool'.")
}
