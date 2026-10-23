import { conventionsContext, type Reviewer } from './verify.ts'
import { parseFindings } from './findings.ts'
import type { UsageLimit } from './backends/types.ts'

/**
 * The design review: the gate proves the app works, this asks whether it is
 * good to use. A reviewer that can see looks at the screenshots of every public
 * screen, against the conventions' UI rules and the PRD's design principles.
 *
 * Advisory, like the code review: screenshots are pixels, and a model's taste
 * is input for the next iteration, never a verdict that fails a run.
 */

export interface PassOutcome {
  /** null when the pass did not run; [] when it ran and found nothing. */
  findings: string[] | null
  limited?: UsageLimit
  skipped?: string
}

export function designPrompt(screenshots: string[]): string {
  return `You are a product designer reviewing an app built autonomously by an AI
coding loop. These are screenshots of its public screens, taken after every
automated check passed. Open each one:
${screenshots.map((s) => `- ${s}`).join('\n')}

Look at them as a first-time user would, and judge them against the UI rules in
the engineering conventions and the design principles in PRD.md. Look for:
- no obvious primary action, or a hierarchy that does not say what matters
- text that is cut off, overlapping, too small or low in contrast
- touch targets that look smaller than 44 points
- spacing, alignment or components that differ between screens
- empty, loading or error states that leave the user with no next step
- copy that is vague, technical, or not in the user's language

Report ONLY problems you can see in a screenshot, worth fixing before a real
user sees them. No praise, no summary. One finding per line, each one small
enough to fix in about an hour, formatted:
- <screen>: <the problem> -> <the fix>

If nothing is worth fixing, output exactly: CLEAN`
}

export async function designReview(cwd: string, screenshots: string[], reviewer: Reviewer): Promise<PassOutcome> {
  if (!screenshots.length) return { findings: null, skipped: 'no screenshots' }
  if (!reviewer.backend.vision) return { findings: null, skipped: `${reviewer.backend.id} cannot look at images` }

  const conventions = conventionsContext(cwd)
  const result = await reviewer.backend.review({
    cwd,
    prompt: designPrompt(screenshots),
    since: 'HEAD',
    conventions: conventions.text,
    conventionFiles: conventions.files,
    spec: reviewer.spec,
    images: screenshots,
    ...(reviewer.budgetUsd ? { budgetUsd: reviewer.budgetUsd } : {}),
    ...(reviewer.onOutput ? { onOutput: reviewer.onOutput } : {}),
  })
  if (result.costUsd !== null) {
    reviewer.budget?.add(`design:${reviewer.backend.id}`, result.costUsd, { notional: reviewer.billing === 'subscription' })
  }
  if (result.limited) return { findings: null, limited: result.limited }
  if (!result.ok) return { findings: null, skipped: 'the reviewer failed' }
  return { findings: parseFindings(result.text) }
}
