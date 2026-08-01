import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ui } from '../core/ui.ts'
import { paths } from '../core/paths.ts'
import { telegramCredentials } from '../agent/notify.ts'
import { readLock, requestStop } from '../agent/lock.ts'

/**
 * Telegram control daemon.
 *
 * The machine sits behind NAT, so a webhook is not an option — long polling is.
 * Kept deliberately small: it answers button presses and nothing else. When a
 * control plane arrives, this is where its connection lands.
 */

interface Update {
  update_id: number
  callback_query?: {
    id: string
    data?: string
    message?: { chat: { id: number } }
  }
}

async function api(token: string, method: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(70_000),
  })
  return res.json()
}

function latestLog(): string {
  if (!existsSync(paths.logs)) return 'No logs yet.'
  const files = readdirSync(paths.logs)
    .filter((f) => f.endsWith('.log'))
    .sort()
  const newest = files.at(-1)
  if (!newest) return 'No logs yet.'
  const body = readFileSync(join(paths.logs, newest), 'utf8').split('\n')
  return `${newest}\n\n${body.slice(-25).join('\n')}`
}

function statusText(): string {
  const lock = readLock()
  if (!lock) return 'Idle — no run active.'
  const since = new Date(lock.startedAt)
  const mins = Math.round((Date.now() - since.getTime()) / 60000)
  return `Running ${lock.project} (pid ${lock.pid}) for ${mins} min.`
}

export async function listenCommand(): Promise<number> {
  const creds = telegramCredentials()
  if (!creds) {
    ui.error("Telegram is not configured. Run 'circon config'.")
    return 1
  }

  ui.ok('Listening for Telegram control messages. Ctrl-C to stop.')
  let offset = 0

  for (;;) {
    try {
      const res = (await api(creds.token, 'getUpdates', {
        offset,
        timeout: 50,
        allowed_updates: ['callback_query'],
      })) as { ok?: boolean; result?: Update[] }

      for (const update of res.result ?? []) {
        offset = update.update_id + 1
        const query = update.callback_query
        if (!query) continue

        let reply: string
        switch (query.data) {
          case 'stop': {
            const lock = readLock()
            if (lock) {
              requestStop()
              reply = `Stop requested for ${lock.project}. It will end after this iteration.`
            } else {
              reply = 'No run is active.'
            }
            break
          }
          case 'status':
            reply = statusText()
            break
          case 'log':
            reply = latestLog()
            break
          default:
            reply = `Unknown action: ${query.data ?? '(none)'}`
        }

        await api(creds.token, 'answerCallbackQuery', { callback_query_id: query.id })
        if (query.message?.chat.id) {
          await api(creds.token, 'sendMessage', {
            chat_id: query.message.chat.id,
            text: reply.slice(0, 4000),
            disable_web_page_preview: true,
          })
        }
      }
    } catch (err) {
      // Long polling times out by design, and the network may blip. Never exit.
      const message = err instanceof Error ? err.message : String(err)
      if (!/timeout|aborted/i.test(message)) ui.warn(`listen: ${message}`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}
