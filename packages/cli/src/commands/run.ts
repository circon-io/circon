import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { run, which } from '../core/exec.ts'
import { ui } from '../core/ui.ts'
import { paths, projectPaths } from '../core/paths.ts'
import { readConfig } from '../core/config.ts'
import { runGate } from '../agent/gate.ts'
import { Repo } from '../agent/git.ts'
import { acquireLock, releaseLock, stopRequested, clearStop } from '../agent/lock.ts'
import { notify } from '../agent/notify.ts'
import { runVerification } from '../agent/verify.ts'
import { readConventions } from '../components/workspace.ts'

const STUCK_LIMIT = 3

function elapsed(startedAt: number): string {
  const secs = Math.floor((Date.now() - startedAt) / 1000)
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

/** Lines the agent appended to progress.txt during this run — its own account. */
function newNotes(cwd: string, startLines: number): string {
  const file = join(cwd, 'progress.txt')
  if (!existsSync(file)) return ''
  return readFileSync(file, 'utf8')
    .split('\n')
    .slice(startLines)
    .filter((l) => l.trim() && !l.includes('ALL_TASKS_COMPLETE'))
    .slice(-6)
    .join('\n')
}

export async function runCommand(maxLoops = 20): Promise<number> {
  const cwd = process.cwd()
  const project = basename(cwd)
  const cfg = readConfig()
  const repo = new Repo(cwd)

  if (!(await repo.isRepo())) {
    ui.error('Not a git repository. Run circon from a project root.')
    return 1
  }

  // Design before code — the PRD template ships these as marker comments.
  // Both spellings are accepted so a PRD written before the rename still gates.
  const prdPath = join(cwd, 'PRD.md')
  const prdText = existsSync(prdPath) ? readFileSync(prdPath, 'utf8') : ''
  if (/(CIRCON|SOLYD)-UNFILLED/.test(prdText)) {
    ui.error('PRD.md still has unfilled design sections.')
    ui.info('Write the Design Principles and User Flows, then delete those comment blocks.')
    ui.dim('Coding before they exist produces an app whose screens each invent their own design.')
    return 1
  }

  const held = acquireLock(project)
  if (held) {
    ui.error(`A run is already active (pid ${held.pid}, project ${held.project}).`)
    ui.info("Use 'circon stop' to end it.")
    return 1
  }
  clearStop()

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

    // Single pull point: bring in PRD and convention changes before anything
    // starts, never mid-loop where it would race the agent's own commits.
    const base = await repo.defaultBranch()
    await repo.pullBase(base)
    try {
      const { created, merged } = await repo.ensureWorkBranch(cfg.workBranch, base)
      ui.info(
        created
          ? `Created work branch ${cfg.workBranch}`
          : `On ${cfg.workBranch}${merged ? ` (merged ${base})` : ''}`,
      )
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
    const progressStart = readFileSync(progressFile, 'utf8').split('\n').length - 1

    // Read-only and prompt-cached, so the contract is not re-paid every loop.
    const conventionFiles: string[] = []
    if (readConventions()) {
      conventionFiles.push('--read', join(paths.conventions, 'ARCHITECTURE.md'))
    }
    if (existsSync(join(cwd, projectPaths.conventions))) {
      conventionFiles.push('--read', projectPaths.conventions)
    }

    ui.heading(`circon run — ${project}`)
    ui.dim(`branch ${cfg.workBranch} · max ${maxLoops} iterations`)
    ui.dim(`log ${runLog}`)

    const startedAt = Date.now()
    let commits = 0
    let stuck = 0
    let lastFailure = ''
    let verifyNotes = ''
    let allDone = false
    let stopped = false

    for (let i = 1; i <= maxLoops; i++) {
      // Checked between iterations only, so a stop never lands mid-commit.
      if (stopRequested()) {
        stopped = true
        ui.warn('Stop requested — ending cleanly between iterations.')
        break
      }

      ui.heading(`Iteration ${i}/${maxLoops}`)

      const prompt = [
        'Pick the SINGLE highest-priority incomplete task from PRD.md. Implement ONLY that task.',
        'Update PRD.md and progress.txt with your changes.',
        "If all tasks are finished, append 'ALL_TASKS_COMPLETE' to progress.txt.",
        '',
        'Follow ARCHITECTURE.md, loaded read-only in this session. It is the standing',
        'engineering contract for every project here and overrides your own defaults.',
        lastFailure,
        verifyNotes,
      ]
        .filter(Boolean)
        .join('\n')

      appendFileSync(runLog, `\n--- iteration ${i} ---\n`)
      const aiderRun = await run(
        aider,
        [
          'PRD.md', 'progress.txt', ...conventionFiles,
          '--architect',
          '--model', 'sonnet',
          '--editor-model', 'ollama_chat/qwen2.5-coder:7b',
          '--message', prompt,
          '--yes-always',
          '--no-auto-commits',
        ],
        { cwd, stream: true },
      )
      appendFileSync(runLog, aiderRun.stdout + aiderRun.stderr)

      ui.step('Running the quality gate…')
      const gate = await runGate({ cwd })
      appendFileSync(runLog, gate.output)
      if (gate.ranTiers.length) ui.dim(`tiers: ${gate.ranTiers.join(' → ')}`)

      if (gate.ok) {
        lastFailure = ''
        await repo.stageAll()
        if (await repo.hasStagedChanges()) {
          const task = await repo.completedTaskFromDiff()
          await repo.commit(task ? `feat: ${task}` : `chore: iteration ${i}`)
          commits++
          stuck = 0
          ui.ok(task ? `Committed: ${task}` : `Committed iteration ${i}`)
        } else {
          ui.warn('No file changes this iteration.')
        }
      } else {
        ui.error(`Gate failed at the ${gate.failedTier} tier — reverting.`)
        await repo.hardReset()
        lastFailure =
          `The previous attempt failed the ${gate.failedTier} gate:\n${gate.output.slice(-2000)}`
        stuck++

        verifyNotes = await runVerification(cwd, `gate failure at the ${gate.failedTier} tier`)

        if (stuck >= STUCK_LIMIT) {
          const work = (await repo.commitsSince(startCommit)).map((s) => `- ${s}`).join('\n')
          await notify(
            [
              `🛑 circon HALTED: ${project}`,
              `Circuit breaker after ${STUCK_LIMIT} consecutive failures.`,
              `Failing tier: ${gate.failedTier}`,
              `Stopped at iteration ${i}/${maxLoops} after ${elapsed(startedAt)}.`,
              '', `Completed before the failure (${commits} commits):`, work,
              '', 'Last agent notes:', newNotes(cwd, progressStart),
              '', `Why it failed (${gate.failedTier}):`,
              gate.output.split('\n').slice(-12).join('\n'),
              '', `Full log: ${runLog}`,
            ].join('\n'),
          )
          ui.error('Circuit breaker tripped. Halting.')
          return 1
        }
      }

      if (readFileSync(progressFile, 'utf8').includes('ALL_TASKS_COMPLETE')) {
        allDone = true
        break
      }

      if (i % cfg.verifyEvery === 0 && gate.ok) {
        verifyNotes = await runVerification(cwd, `scheduled review at iteration ${i}`)
      }
    }

    const pushed = await repo.push(cfg.workBranch)
    const work = (await repo.commitsSince(startCommit)).map((s) => `- ${s}`).join('\n')
    const notes = newNotes(cwd, progressStart)
    const branchLine = pushed
      ? `Branch: ${cfg.workBranch} (pushed)`
      : `Branch: ${cfg.workBranch} (local only)`

    if (allDone) {
      await notify([
        `🎉 circon FINISHED: ${project}`,
        `All PRD tasks complete — ${commits} commits, ${elapsed(startedAt)}.`,
        '', 'What got done:', work,
        '', 'Last agent notes:', notes,
        '', branchLine,
      ].join('\n'))
      ui.ok('All PRD tasks complete.')
    } else if (stopped) {
      await notify([
        `⏹️ circon STOPPED: ${project}`,
        `Stopped on request after ${commits} commits, ${elapsed(startedAt)}.`,
        '', 'What got done:', work,
        '', branchLine,
      ].join('\n'))
      ui.ok('Stopped cleanly.')
    } else {
      const open = (
        (existsSync(prdPath) ? readFileSync(prdPath, 'utf8') : prdText).match(/^- \[ \]/gm) ?? []
      ).length
      await notify([
        `⏸️ circon PAUSED: ${project}`,
        `Hit the ${maxLoops} iteration limit — ${open} tasks still open.`,
        `${commits} commits, ${elapsed(startedAt)}.`,
        '', 'What got done:', work,
        '', 'Last agent notes:', notes,
        '', `Run circon again to continue. ${branchLine}`,
      ].join('\n'))
      ui.ok(`Reached the iteration limit. ${commits} commits.`)
    }
    return 0
  } finally {
    releaseLock()
    clearStop()
  }
}
