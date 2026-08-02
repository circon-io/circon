import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { projectPaths } from '../core/paths.ts'

/**
 * Task state, kept out of PRD.md.
 *
 * The agent used to flip `- [ ]` to `- [x]` in PRD.md. That made both sides
 * write the same file — the human editing the spec on main, the agent marking
 * work done on the run branch — so merging main mid-run conflicted on exactly
 * the lines both had touched.
 *
 * PRD.md is now read-only to the agent and completion lives here, which makes a
 * live PRD update a clean fast-forward of a file only one side writes.
 */

export interface Task {
  /** Stable across edits to unrelated tasks: a hash of the task text. */
  id: string
  text: string
  done: boolean
  commit?: string
  completedAt?: string
}

interface ProgressFile {
  completed: Record<string, { text: string; commit?: string; at: string }>
}

/** Only `- [ ]` / `- [x]` bullets count, so prose in the PRD is never a task. */
const TASK_LINE = /^[-*]\s+\[([ xX])\]\s+(.+?)\s*$/

export function taskId(text: string): string {
  return createHash('sha1').update(text.trim()).digest('hex').slice(0, 12)
}

function progressPath(cwd: string): string {
  return join(cwd, projectPaths.progress)
}

function readProgress(cwd: string): ProgressFile {
  const file = progressPath(cwd)
  if (!existsSync(file)) return { completed: {} }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as ProgressFile
    return parsed.completed ? parsed : { completed: {} }
  } catch {
    return { completed: {} }
  }
}

/**
 * The PRD's tasks, merged with recorded completion.
 *
 * A checkbox already ticked in the PRD counts as done too — a human can still
 * mark something complete by hand, and re-doing it would be worse than trusting
 * them.
 */
export function readTasks(cwd: string, prdFile = 'PRD.md'): Task[] {
  const prd = join(cwd, prdFile)
  if (!existsSync(prd)) return []

  const progress = readProgress(cwd)
  const tasks: Task[] = []

  for (const line of readFileSync(prd, 'utf8').split('\n')) {
    const match = line.match(TASK_LINE)
    if (!match) continue
    const checked = match[1] !== ' '
    const text = match[2] ?? ''
    if (!text) continue

    const id = taskId(text)
    const recorded = progress.completed[id]
    const task: Task = { id, text, done: checked || Boolean(recorded) }
    if (recorded?.commit) task.commit = recorded.commit
    if (recorded?.at) task.completedAt = recorded.at
    tasks.push(task)
  }
  return tasks
}

export function openTasks(cwd: string, prdFile = 'PRD.md'): Task[] {
  return readTasks(cwd, prdFile).filter((t) => !t.done)
}

export function markComplete(cwd: string, text: string, commit?: string): void {
  const file = progressPath(cwd)
  const progress = readProgress(cwd)
  progress.completed[taskId(text)] = {
    text: text.trim(),
    at: new Date().toISOString(),
    ...(commit ? { commit } : {}),
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(progress, null, 2)}\n`)
}

/**
 * Which task did this iteration finish?
 *
 * Ask the agent to name it in progress.txt rather than inferring it from a diff
 * of PRD.md, which the agent no longer writes. Falls back to the first open
 * task, since the prompt instructs it to take the highest-priority one.
 */
export function inferCompletedTask(
  cwd: string,
  notesAdded: string,
  openBefore: Task[],
): Task | null {
  const declared = notesAdded.match(/^\s*COMPLETED:\s*(.+?)\s*$/m)?.[1]
  if (declared) {
    const exact = openBefore.find((t) => t.text.trim() === declared.trim())
    if (exact) return exact
    const loose = openBefore.find(
      (t) =>
        t.text.toLowerCase().includes(declared.toLowerCase()) ||
        declared.toLowerCase().includes(t.text.toLowerCase()),
    )
    if (loose) return loose
  }
  return openBefore[0] ?? null
}

export function allComplete(cwd: string, prdFile = 'PRD.md'): boolean {
  const tasks = readTasks(cwd, prdFile)
  return tasks.length > 0 && tasks.every((t) => t.done)
}
