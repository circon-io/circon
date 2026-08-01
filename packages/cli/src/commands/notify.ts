import { ui } from '../core/ui.ts'
import { notify } from '../agent/notify.ts'
import { telegramCredentials } from '../agent/notify.ts'

export async function notifyCommand(message: string): Promise<number> {
  if (!message.trim()) {
    ui.error('Usage: circon notify <message>')
    return 1
  }
  if (!telegramCredentials()) {
    ui.error("Telegram is not configured. Run 'circon config'.")
    return 1
  }
  const sent = await notify(message)
  if (sent) ui.ok('Sent.')
  return sent ? 0 : 1
}
