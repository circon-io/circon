import { ui } from '../core/ui.ts'
import { review } from '../agent/verify.ts'

export async function verifyCommand(reason: string): Promise<number> {
  const findings = await review(process.cwd(), reason)
  if (findings === null) {
    ui.ok('Nothing to report.')
    return 0
  }
  ui.heading('Review findings')
  ui.info(findings)
  return 0
}
