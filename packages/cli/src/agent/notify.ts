import { readEnvFile } from '../core/config.ts'

/**
 * Telegram delivery. Fails open by design: a machine with no bot configured
 * must never break a run, so every failure here is a warning at most.
 *
 * Plain text, no parse_mode — Markdown/HTML parsing rejects messages containing
 * stray `_`, `*` or `<`, which commit subjects and diffs are full of.
 */

const LIMIT = 4000

export interface Button {
  text: string
  /** Callback payload, e.g. "stop" or "status". */
  action: string
}

export interface NotifyOptions {
  /** Rendered as an inline keyboard, one row per array. */
  buttons?: Button[][]
  silent?: boolean
}

interface TelegramCreds {
  token: string
  chatId: string
}

export function telegramCredentials(): TelegramCreds | null {
  const env = readEnvFile('telegram')
  const token = env['TELEGRAM_BOT_TOKEN']
  const chatId = env['TELEGRAM_CHAT_ID']
  return token && chatId ? { token, chatId } : null
}

export async function notify(message: string, opts: NotifyOptions = {}): Promise<boolean> {
  const creds = telegramCredentials()
  if (!creds || !message.trim()) return false

  const text = message.length > LIMIT ? `${message.slice(0, LIMIT)}\n… (truncated)` : message

  const body: Record<string, unknown> = {
    chat_id: creds.chatId,
    text,
    disable_web_page_preview: true,
  }
  if (opts.silent) body['disable_notification'] = true
  if (opts.buttons?.length) {
    body['reply_markup'] = {
      inline_keyboard: opts.buttons.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.action })),
      ),
    }
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error(`notify: Telegram returned HTTP ${res.status}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`notify: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/** The standard control row attached to run notifications. */
export const CONTROL_BUTTONS: Button[][] = [
  [
    { text: '⏹ Stop', action: 'stop' },
    { text: '📊 Status', action: 'status' },
  ],
  [
    { text: '📄 Last log', action: 'log' },
  ],
]
