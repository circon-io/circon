import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { run, which } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { paths, projectPaths } from '../core/paths.ts'
import { readConfig } from '../core/config.ts'
import { runGate } from '../agent/gate.ts'
import { Repo } from '../agent/git.ts'
import { acquireLock, releaseLock, stopRequested, clearStop } from '../agent/lock.ts'
import { runVerification } from '../agent/verify.ts'
import { readConventions } from '../components/workspace.ts'
import { RunBudget, parseAiderCost, usd } from '../agent/spend.ts'
import { readTasks, openTasks, markComplete, inferCompletedTask, allComplete } from '../agent/progress.ts'
import { preflight, classifyFailure, backoffMs } from '../agent/health.ts'
import {
  captureScreenshots, existingScreenshots, openPullRequest, prBody, prTitle, type RunSummary,
} from '../agent/review.ts'
import { collect } from './gc.ts'
import {
  reportRun, cloneCredential, requestPullRequest, type RunRecord,
} from '../agent/control-plane.ts'

const STUCK_LIMIT = 3
const INFRA_RETRY_LIMIT = 5

function elapsed(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function notesSince(cwd: string, startLines: number): string {
  const file = join(cwd, 'progress.txt')
  if (!existsSync(file)) return ''
  return readFileSync(file, 'utf8')
    .split('\n')
    .slice(startLines)
    .filter((l) => l.trim())
    .join('\n')
}

export interface RunOptions {
  /**
   * Set when the control plane dispatched this run, so the job can be closed
   * when it ends. Absent for a run started by hand.
   */
  jobId?: string
}

export async function runCommand(maxLoops = 20, opts: RunOptions = {}): Promise<number> {
  const cwd = process.cwd()
  const project = basename(cwd)
  const cfg = readConfig()
  const repo = new Repo(cwd)

  if (!(await repo.isRepo())) {
    ui.error('Not a git repository. Run circon from a project root.')
    return 1
  }

  const prdPath = join(cwd, 'PRD.md')
  const prdText = existsSync(prdPath) ? readFileSync(prdPath, 'utf8') : ''
  if (/(CIRCON|SOLYD)-UNFILLED/.test(prdText)) {
    ui.error('PRD.md still has unfilled design sections.')
    ui.info('Write the Design Principles and User Flows, then delete those comment blocks.')
    return 1
  }

  const held = acquireLock(project)
  if (held) {
    ui.error(`A run is already active (pid ${held.pid}, project ${held.project}).`)
    ui.info("Use 'circon stop' to end it.")
    return 1
  }
  clearStop()

  // Declared out here so the finally can report even an aborted run: a record
  // left at 'running' is worse than one marked failed, because nothing ever
  // clears it. Null until the run actually starts.
  let report: RunRecord | null = null

  try {
    const aider = await which('aider')
    if (!aider) {
      ui.error("aider is not installed. Run 'circon setup'.")
      return 1
    }
    if (!process.env['ANTHROPIC_API_KEY']) {
      ui.error("ANTHROPIC_API_KEY is not set. Run 'circon config'.")
      return 1
    }

    // Money is checked before anything is spent, not after.
    const budget = new RunBudget(project, cfg.budgetPerRunUsd, cfg.budgetPerDayUsd)
    const blocked = budget.blockedBeforeStart()
    if (blocked) {
      ui.error(`Refusing to start — ${blocked}.`)
      ui.dim('Raise budgetPerDayUsd in ~/.config/circon/config.json, or wait for tomorrow.')
      return 1
    }

    // One branch per run: it maps 1:1 to a PR and therefore to a review
    // decision, so an abandoned run is deleted without touching anything else.
    const base = await repo.defaultBranch()
    await repo.pullBase(base)
    const branch = `circon/run-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`
    try {
      await repo.createRunBranch(branch, base)
      ui.info(`Working on ${branch} (from ${base})`)
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err))
      return 1
    }

    mkdirSync(paths.logs, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const runLog = join(paths.logs, `${project}-${stamp}.log`)
    const startCommit = await repo.head()

    const progressFile = join(cwd, 'progress.txt')
    if (!existsSync(progressFile)) writeFileSync(progressFile, '')
    const notesStart = readFileSync(progressFile, 'utf8').split('\n').length - 1

    const conventionFiles: string[] = []
    if (readConventions()) {
      conventionFiles.push('--read', join(paths.conventions, 'ARCHITECTURE.md'))
    }
    if (existsSync(join(cwd, projectPaths.conventions))) {
      conventionFiles.push('--read', projectPaths.conventions)
    }

    const tasksAtStart = readTasks(cwd)
    ui.heading(`circon run — ${project}`)
    ui.dim(`${tasksAtStart.filter((t) => !t.done).length} open tasks · max ${maxLoops} iterations`)
    ui.dim(`log ${runLog}`)

    const startedAt = Date.now()
    // Reported twice: now, so the dashboard shows the run live with a truthful
    // start time, and again at the end with the outcome. The endpoint upserts on
    // runId. Unenrolled runners get `false` and carry on.
    report = { runId: `run_${randomBytes(9).toString('hex')}`, projectSlug: project, branch, ...(opts.jobId ? { jobId: opts.jobId } : {}) }
    await reportRun(report)

    const completed: ReturnType<typeof readTasks> = []
    let commits = 0
    let stuck = 0
    let infraRetries = 0
    let lastFailure = ''
    let verifyNotes = ''
    let gateTiers: string[] = []
    let ended: 'complete' | 'stopped' | 'budget' | 'limit' = 'limit'

    for (let i = 1; i <= maxLoops; i++) {
      if (stopRequested()) {
        ended = 'stopped'
        ui.warn('Stop requested — ending cleanly between iterations.')
        break
      }

      const overspent = budget.exceeded()
      if (overspent) {
        ended = 'budget'
        ui.warn(`Stopping — ${overspent}.`)
        break
      }

      // Infrastructure is checked before the agent is paid to discover it.
      const sick = await preflight(conventionFiles.length >= 0)
      if (sick) {
        if (!sick.transient || infraRetries >= INFRA_RETRY_LIMIT) {
          ui.error(`Infrastructure problem: ${sick.what} — ${sick.detail}`)
          // Named separately from a gate failure: the code was never the problem.
          report.outcome = 'infrastructure'
          return 1
        }
        infraRetries++
        const wait = backoffMs(infraRetries)
        ui.warn(`${sick.what}: ${sick.detail}. Retrying in ${wait / 1000}s…`)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }

      ui.heading(`Iteration ${i}/${maxLoops}`)
      const openBefore = openTasks(cwd)
      if (openBefore.length === 0) {
        ended = 'complete'
        break
      }

      const prompt = [
        `Implement ONLY this task: ${openBefore[0]?.text ?? 'the highest-priority open task'}`,
        '',
        'Do NOT edit PRD.md — it is the human-owned specification and circon tracks',
        'completion separately. Record what you did in progress.txt, ending with a',
        'line of the form:',
        '  COMPLETED: <the exact task text>',
        '',
        'Follow ARCHITECTURE.md, loaded read-only in this session. It is the standing',
        'engineering contract and overrides your own defaults.',
        lastFailure,
        verifyNotes,
      ]
        .filter(Boolean)
        .join('\n')

      appendFileSync(runLog, `\n--- iteration ${i} ---\n`)
      const aiderRun = await run(
        aider,
        [
          'progress.txt', ...conventionFiles, '--read', 'PRD.md',
          '--architect',
          '--model', 'sonnet',
          '--editor-model', 'ollama_chat/qwen2.5-coder:7b',
          '--message', prompt,
          '--yes-always',
          '--no-auto-commits',
        ],
        { cwd, stream: true },
      )
      const aiderOut = aiderRun.stdout + aiderRun.stderr
      appendFileSync(runLog, aiderOut)

      const cost = parseAiderCost(aiderOut)
      if (cost !== null) budget.add('aider', cost)

      ui.step('Running the quality gate…')
      const gate = await runGate({ cwd })
      appendFileSync(runLog, gate.output)
      if (gate.ranTiers.length) {
        gateTiers = gate.ranTiers
        ui.dim(`tiers: ${gate.ranTiers.join(' → ')} · ${budget.summary()}`)
      }

      if (!gate.ok) {
        // A broken machine is not the agent's fault, and reverting its work
        // teaches it nothing — so this must not count toward the breaker.
        const infra = classifyFailure(gate.output)
        if (infra && infraRetries < INFRA_RETRY_LIMIT) {
          infraRetries++
          await repo.hardReset()
          const wait = backoffMs(infraRetries)
          ui.warn(`Infrastructure, not the code: ${infra.detail}. Retrying in ${wait / 1000}s…`)
          appendFileSync(runLog, `\n[infrastructure] ${infra.detail}\n`)
          await new Promise((r) => setTimeout(r, wait))
          i--
          continue
        }
      }

      if (gate.ok) {
        lastFailure = ''
        infraRetries = 0
        await repo.stageAll()

        if (await repo.hasStagedChanges()) {
          const notes = notesSince(cwd, notesStart)
          const task = inferCompletedTask(cwd, notes, openBefore)
          await repo.commit(task ? `feat: ${task.text}` : `chore: iteration ${i}`)
          const sha = await repo.head()
          if (task) {
            markComplete(cwd, task.text, sha ?? undefined)
            completed.push({ ...task, done: true })
            // The state file is part of the commit that completed the task.
            await repo.stageAll()
            if (await repo.hasStagedChanges()) await repo.commit(`chore: record ${task.text}`)
          }
          commits++
          stuck = 0
          ui.ok(task ? `Completed: ${task.text}` : `Committed iteration ${i}`)
        } else {
          ui.warn('No file changes this iteration.')
        }
      } else {
        ui.error(`Gate failed at the ${gate.failedTier} tier — reverting.`)
        await repo.hardReset()
        lastFailure =
          `The previous attempt failed the ${gate.failedTier} gate:\n${gate.output.slice(-2000)}`
        report.failedTier = gate.failedTier ?? 'unknown'
        stuck++
        verifyNotes = await runVerification(cwd, `gate failure at the ${gate.failedTier} tier`, budget)

        if (stuck >= STUCK_LIMIT) {
          ui.error(`Circuit breaker: ${STUCK_LIMIT} consecutive gate failures. Halting.`)
          ui.dim(budget.summary())
          report.outcome = 'stuck'
          report.iterations = i
          report.costUsd = budget.total
          return 1
        }
      }

      if (allComplete(cwd)) {
        ended = 'complete'
        break
      }

      if (i % cfg.verifyEvery === 0 && gate.ok) {
        verifyNotes = await runVerification(cwd, `scheduled review at iteration ${i}`, budget)
      }
    }

    // ---- wrap up -------------------------------------------------------------
    const commitSubjects = await repo.commitsSince(startCommit)
    if (commitSubjects.length === 0) {
      ui.warn('No commits produced — nothing to review.')
      ui.dim(budget.summary())
      report.outcome = 'no-commits'
      report.costUsd = budget.total
      return 0
    }

    const pushed = await repo.push(branch)
    const screenshots = [...(await captureScreenshots(cwd)), ...existingScreenshots(cwd)]

    const summary: RunSummary = {
      project,
      branch,
      iterations: commits,
      commits: commitSubjects,
      tasksCompleted: completed,
      tasksOpen: openTasks(cwd),
      notes: notesSince(cwd, notesStart),
      gateTiers,
      costUsd: budget.total,
      logPath: runLog,
    }

    let prUrl: string | null = null
    if (pushed) {
      // A fresh token rather than one held since the clone: an hour has very
      // likely passed, and this is the last thing a run does.
      const appToken = (await cloneCredential(project))?.token
      const pr = await openPullRequest(cwd, repo, summary, screenshots, base, appToken)
      prUrl = pr.url

      if (!prUrl) {
        // gh is missing or unauthenticated. The control plane holds the App key,
        // so it can open the PR even on a runner that has never seen GitHub.
        prUrl = await requestPullRequest({
          project,
          title: prTitle(summary),
          body: prBody(summary, screenshots),
          head: branch,
          base,
        })
        if (!prUrl && pr.reason) ui.warn(`No PR opened: ${pr.reason}`)
      }
    }

    ui.blank()
    switch (ended) {
      case 'complete': ui.ok('All PRD tasks complete.'); break
      case 'stopped':  ui.ok('Stopped on request.'); break
      case 'budget':   ui.warn('Stopped on budget.'); break
      default:         ui.ok(`Reached the iteration limit.`)
    }
    ui.info(`${commits} commits · ${elapsed(startedAt)} · ${budget.summary()}`)
    ui.info(`Branch ${branch}${pushed ? ' (pushed)' : ' (local only)'}`)
    if (prUrl) ui.info(`Review: ${prUrl}`)

    report.outcome = ended
    report.iterations = commits
    report.commits = commitSubjects.length
    report.costUsd = budget.total
    if (prUrl) report.prUrl = prUrl

    // Housekeeping while nothing else is running.
    const reclaimed = await collect({ cwd })
    if (reclaimed.length) ui.dim(`gc: tidied ${reclaimed.length} thing(s)`)

    return 0
  } finally {
    if (report) {
      // No outcome means something threw. Recording that is the point.
      report.outcome ??= 'aborted'
      await reportRun(report)
    }
    releaseLock()
    clearStop()
  }
}
