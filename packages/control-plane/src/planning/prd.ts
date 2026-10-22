/**
 * What a generated PRD must look like for a runner to work from it.
 *
 * The runner reads tasks with exactly this pattern (`readTasks` in the CLI's
 * `agent/progress.ts`), and refuses to start while an `UNFILLED` marker
 * remains. `prd.test.ts` imports the CLI's parser so the two cannot drift.
 */

export const TASK_LINE = /^[-*]\s+\[([ xX])\]\s+(.+)$/

const REQUIRED_SECTIONS = ['Objective', 'Design Principles', 'User Flows', 'Task Backlog']
/**
 * Optional: the planner's ideas the owner did not ask for, not yet accepted.
 * The runner's `readTasks` never takes a task from this section.
 */
const PROPOSALS = 'proposed additions'

export interface PrdCheck {
  ok: boolean
  errors: string[]
  tasks: string[]
}

/** The model is told not to fence its answer; it sometimes does anyway. */
export function extractPrd(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/)
  return `${(fenced?.[1] ?? trimmed).trim()}\n`
}

export function checkPrd(prd: string): PrdCheck {
  const errors: string[] = []
  const lines = prd.split('\n')
  const headings = lines
    .map((l) => /^##\s+(.+?)\s*$/.exec(l)?.[1])
    .filter((h): h is string => Boolean(h))

  for (const section of REQUIRED_SECTIONS) {
    if (!headings.some((h) => h.toLowerCase() === section.toLowerCase())) {
      errors.push(`missing the "## ${section}" section`)
    }
  }
  if (/(CIRCON|SOLYD)-UNFILLED/.test(prd)) {
    errors.push('still contains an UNFILLED marker, which stops every run')
  }

  // Task lines under Proposed additions are skipped, as the runner skips them,
  // but still refused: the owner would think they were accepted.
  const tasks: string[] = []
  let section = ''
  let proposedAsTasks = false
  for (const line of lines) {
    section = /^##\s+(.+?)\s*$/.exec(line)?.[1]?.toLowerCase() ?? section
    const m = TASK_LINE.exec(line.trim())
    if (!m?.[2]) continue
    if (section === PROPOSALS) proposedAsTasks = true
    else tasks.push(m[2].trim())
  }
  if (tasks.length < 3) errors.push(`has ${tasks.length} task(s); a backlog needs at least 3 "- [ ]" lines`)
  if (new Set(tasks).size !== tasks.length) {
    // Task identity is a hash of its text, so duplicates would complete together.
    errors.push('has duplicate tasks')
  }
  if (proposedAsTasks) {
    errors.push('has task lines under "## Proposed additions"; proposals stay a numbered list until the owner promotes them')
  }

  return { ok: errors.length === 0, errors, tasks }
}

/** A line diff for the history view: enough to see what a refinement changed. */
export function lineDiff(before: string, after: string): Array<{ op: ' ' | '+' | '-'; line: string }> {
  const a = before.split('\n')
  const b = after.split('\n')
  // Longest common subsequence; PRDs are a few hundred lines, so O(n·m) is fine.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: Array<{ op: ' ' | '+' | '-'; line: string }> = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', line: a[i]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: '-', line: a[i++]! })
    } else {
      out.push({ op: '+', line: b[j++]! })
    }
  }
  while (i < a.length) out.push({ op: '-', line: a[i++]! })
  while (j < b.length) out.push({ op: '+', line: b[j++]! })
  return out
}
