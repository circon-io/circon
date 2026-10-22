import { ui } from '../core/ui.ts'
import { review, reviewerFromConfig } from '../agent/verify.ts'

export async function verifyCommand(reason: string): Promise<number> {
  const reviewer = await reviewerFromConfig()
  if ('error' in reviewer) {
    ui.error(reviewer.error)
    return 1
  }
  ui.dim(`Reviewing with ${reviewer.backend.id}${reviewer.spec.model ? ` (${reviewer.spec.model})` : ''}…`)
  const { findings, limited } = await review(process.cwd(), reason, reviewer)
  if (limited) {
    ui.warn(`The reviewer hit its ${limited.detail}${limited.resetAt ? `; it resets ${limited.resetAt.toLocaleString()}` : ''}.`)
    return 1
  }
  if (findings === null) {
    ui.ok('Nothing to report.')
    return 0
  }
  ui.heading('Review findings')
  ui.info(findings)
  return 0
}
