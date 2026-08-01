import { createInterface } from 'node:readline/promises'
import { ui } from '../core/ui.ts'
import { writeEnvFile, readEnvFile, writeConfig, readConfig } from '../core/config.ts'
import { paths } from '../core/paths.ts'

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
    const telegram = readEnvFile('telegram')
    const cfg = readConfig()

    ui.blank()
    ui.info('Anthropic (architect model and the review pass)')
    const key = await ask(rl, 'API key', anthropic['ANTHROPIC_API_KEY'])
    if (key) writeEnvFile('anthropic', { ANTHROPIC_API_KEY: key }, 'Anthropic credentials')

    ui.blank()
    ui.info('Telegram (notifications and remote control) — Enter to skip')
    const token = await ask(rl, 'Bot token', telegram['TELEGRAM_BOT_TOKEN'])
    const chat = token ? await ask(rl, 'Chat ID', telegram['TELEGRAM_CHAT_ID']) : ''
    if (token && chat) {
      // Validate now, so a typo surfaces here rather than as three days of silence.
      let valid = false
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
          signal: AbortSignal.timeout(10_000),
        })
        valid = res.ok
      } catch { valid = false }
      writeEnvFile('telegram', { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat }, 'Telegram credentials')
      if (valid) ui.ok('Telegram token accepted.')
      else ui.warn('Telegram rejected that token — saved anyway, fix it and re-run.')
    }

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
