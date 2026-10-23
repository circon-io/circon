import { conventionsContext, type Reviewer } from './verify.ts'
import { parseFindings } from './findings.ts'
import type { PassOutcome } from './design.ts'

/**
 * The security audit: once per run, when every PRD task is done, over the whole
 * repository rather than a diff. The code review sees each change; a missing
 * role check is the absence of a change, which only a whole-repo read finds.
 *
 * Its own role, so it can be the strongest model or a second vendor. Advisory:
 * findings go in the PR and the release report, where a human decides.
 */

export const AUDIT_PROMPT = `You are auditing this whole repository for security. Every task in PRD.md
is done; this is the last look before a human decides whether to ship. Read the
code itself, not only recent changes, and do not change any file.

Check at least:
1. Authorization: every API route that reads or changes data checks the caller's
   session, and every admin route checks the role on the server, not only in
   the app's navigation.
2. Webhooks: every webhook handler verifies the provider's signature before it
   trusts the body.
3. Secrets: no secret key, token or private credential in app code, in a
   variable the client bundle exposes (EXPO_PUBLIC_*, NEXT_PUBLIC_*), or
   committed to the repository.
4. Validation: every request body, query and path parameter is validated at the
   API boundary, against the shared contract where there is one.
5. Anything in the Security section of the engineering conventions that the
   code does not do.

Report ONLY real problems you can point at in the code. No praise, no summary,
no general advice. One finding per line, most severe first, formatted:
- [high|medium|low] <file>: <the problem> -> <the fix>

If there is nothing to report, output exactly: CLEAN`

export async function securityAudit(cwd: string, since: string, auditor: Reviewer): Promise<PassOutcome> {
  const conventions = conventionsContext(cwd)
  const result = await auditor.backend.review({
    cwd,
    prompt: AUDIT_PROMPT,
    since,
    conventions: conventions.text,
    conventionFiles: conventions.files,
    spec: auditor.spec,
    ...(auditor.budgetUsd ? { budgetUsd: auditor.budgetUsd } : {}),
    ...(auditor.onOutput ? { onOutput: auditor.onOutput } : {}),
  })
  if (result.costUsd !== null) {
    auditor.budget?.add(`audit:${auditor.backend.id}`, result.costUsd, { notional: auditor.billing === 'subscription' })
  }
  if (result.limited) return { findings: null, limited: result.limited }
  if (!result.ok) return { findings: null, skipped: 'the auditor failed' }
  return { findings: parseFindings(result.text) }
}
