import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { ui, setOutputSink } from '../core/ui.ts'
import { paths } from '../core/paths.ts'
import { effectiveConfig, type RoleSpec, type RunConfig } from '../core/config.ts'
import { runGate, type GateDeps, type GateResult } from '../agent/gate.ts'
import { AndroidEmulator } from '../agent/emulator.ts'
import { Repo } from '../agent/git.ts'
import { acquireLock, releaseLock, stopRequested, clearStop } from '../agent/lock.ts'
import { conventionsContext, runVerification, type Reviewer } from '../agent/verify.ts'
import { RunBudget } from '../agent/spend.ts'
import { readTasks, openTasks, markComplete, inferCompletedTask, allComplete } from '../agent/progress.ts'
import { preflight, classifyFailure, backoffMs } from '../agent/health.ts'
import {
  captureScreenshots, existingScreenshots, openPullRequest, prBody, prTitle, type RunSummary,
} from '../agent/review.ts'
import { collect } from './gc.ts'
import {
  reportRun, cloneCredential, requestPullRequest, fetchConfig, isEnrolled, type RunRecord,
} from '../agent/control-plane.ts'
import { silentChannel, type RunChannel } from '../agent/channel.ts'
import {
  realBackends, resolveRoles, describeRoles, type Backends, type AgentBackend, type AgentResult, type Billing,
} from '../agent/backends/index.ts'
import type { UsageLimit } from '../agent/backends/types.ts'

const STUCK_LIMIT = 3
const INFRA_RETRY_LIMIT = 5
/** A limit that lifts later than this ends the run instead of holding the machine. */
const MAX_LIMIT_WAIT_MS = 6 * 3600_000
const DEFAULT_LIMIT_WAIT_MS = 30 * 60_000

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

/** What the dashboard changed while the run was going; read at iteration boundaries. */
export interface RefreshSignals {
  take(): { config: boolean; prd: boolean }
}

export interface RunOptions {
  /**
   * Set when the control plane dispatched this run, so the job can be closed
   * when it ends. Absent for a run started by hand.
   */
  jobId?: string
  /** The job's config snapshot (org < runner < project), resolved at claim time. */
  config?: RunConfig
  /** Where progress and output go besides the terminal: the dashboard, for a dispatched run. */
  channel?: RunChannel
  refresh?: RefreshSignals
}

/** Everything the loop decides with, injectable so the loop itself is testable. */
export interface RunDeps {
  backends: Backends
  gate: (deps: GateDeps) => Promise<GateResult>
  preflight: typeof preflight
  sleep: (ms: number) => Promise<void>
  /** Post-run housekeeping; it can prune the machine's pnpm store, so tests replace it. */
  collect: typeof collect
}

const realDeps = (): RunDeps => ({
  backends: realBackends(),
  gate: runGate,
  preflight,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  collect,
})

interface Seat {
  spec: RoleSpec
  backend: AgentBackend
  billing: Billing
}

export async function runCommand(
  maxLoops = 20,
  opts: RunOptions = {},
  injected: Partial<RunDeps> = {},
): Promise<number> {
  const deps: RunDeps = { ...realDeps(), ...injected }
  const cwd = process.cwd()
  const project = basename(cwd)
  const repo = new Repo(cwd)
  const channel = opts.channel ?? silentChannel

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

  // An enrolled runner fetches its settings even for a dispatched run: the job
  // carries the config, but the dashboard URL for the PR comes from here.
  const settings = isEnrolled() ? await fetchConfig(project) : null
  let cfg = effectiveConfig(opts.config ?? settings?.config)
  setOutputSink((line) => channel.log(`${line}\n`))

  // Declared out here so the finally can report even an aborted run: a record
  // left at 'running' is worse than one marked failed, because nothing ever
  // clears it. Null until the run actually starts.
  let report: RunRecord | null = null
  // Booted on the android tier's first need, and always shut down below.
  const emulator = new AndroidEmulator()
  let emulatorWarned = false
  const ensureAndroidDevice = async (): Promise<boolean> => {
    const device = await emulator.ensure()
    if (device.started) ui.dim('android: booted the emulator for the gate')
    if (!device.ok && !emulatorWarned) {
      emulatorWarned = true
      ui.warn(`android UI tier skipped: ${device.reason ?? 'no device'}`)
    }
    return device.ok
  }

  try {
    // ---- who does what ---------------------------------------------------------
    const roles = resolveRoles(cfg)
    const seat = async (spec: RoleSpec): Promise<Seat | string> => {
      const backend = deps.backends[spec.backend]
      const availability = await backend.available(spec)
      return availability.ok
        ? { spec, backend, billing: availability.billing }
        : (availability.reason ?? `${spec.backend} is not available`)
    }

    const builder = await seat(roles.build)
    if (typeof builder === 'string') {
      ui.error(`Cannot build: ${builder}.`)
      return 1
    }
    // Planning and review make the work better; their absence must not stop it.
    let planner: Seat | null = null
    if (roles.plan) {
      const seated = await seat(roles.plan)
      if (typeof seated === 'string') ui.warn(`Planning step skipped: ${seated}.`)
      else planner = seated
    }
    const reviewSeat = await seat(roles.review)
    if (typeof reviewSeat === 'string') ui.warn(`Review pass skipped: ${reviewSeat}.`)
    const needsLocalModel = [planner, builder, typeof reviewSeat === 'string' ? null : reviewSeat]
      .some((s) => s?.backend.needsLocalModel(s.spec))

    // Money is checked before anything is spent, not after.
    const budget = new RunBudget(project, cfg.budgetPerRunUsd, cfg.budgetPerDayUsd)
    const blocked = budget.blockedBeforeStart()
    if (blocked) {
      ui.error(`Refusing to start — ${blocked}.`)
      ui.dim('Raise budgetPerDayUsd in the dashboard or ~/.config/circon/config.json, or wait for tomorrow.')
      return 1
    }

    const reviewer = (): Reviewer | null =>
      typeof reviewSeat === 'string'
        ? null
        : {
            ...reviewSeat,
            budget,
            budgetUsd: cfg.verifyBudgetUsd,
            onOutput: (chunk) => channel.log(chunk),
          }
    const reviewNotes = async (reason: string): Promise<string> => {
      const r = reviewer()
      return r ? runVerification(cwd, reason, r) : ''
    }

    /** Cost goes to the ledger; subscription usage is recorded as notional. */
    const charge = (who: Seat, role: string, result: AgentResult) => {
      if (result.costUsd !== null) {
        budget.add(`${role}:${who.backend.id}`, result.costUsd, { notional: who.billing === 'subscription' })
      }
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

    // Pinned for the whole run: the conventions are the contract.
    const conventions = conventionsContext(cwd)

    const tasksAtStart = readTasks(cwd)
    ui.heading(`circon run — ${project}`)
    ui.dim(`${tasksAtStart.filter((t) => !t.done).length} open tasks · max ${maxLoops} iterations`)
    const describe = (s: Seat | null) => (s ? `${s.backend.id}${s.spec.model ? `/${s.spec.model}` : ''} (${s.billing})` : 'off')
    ui.dim(
      `plan ${describe(planner)} · build ${describe(builder)} · review ${describe(typeof reviewSeat === 'string' ? null : reviewSeat)}`,
    )
    ui.dim(`log ${runLog}`)

    const startedAt = Date.now()
    // Reported twice: now, so the dashboard shows the run live with a truthful
    // start time, and again at the end with the outcome. The endpoint upserts on
    // runId. Unenrolled runners get `false` and carry on.
    report = {
      runId: `run_${randomBytes(9).toString('hex')}`,
      projectSlug: project,
      branch,
      agents: describeRoles({ plan: planner?.spec ?? null, build: builder.spec, review: roles.review }),
      ...(opts.jobId ? { jobId: opts.jobId } : {}),
    }
    await reportRun(report)
    channel.started({ runId: report.runId, project, branch })

    const completed: ReturnType<typeof readTasks> = []
    let commits = 0
    let stuck = 0
    let infraRetries = 0
    let lastFailure = ''
    let verifyNotes = ''
    let gateTiers: string[] = []
    let ended: 'complete' | 'stopped' | 'budget' | 'limit' | 'usage-limit' = 'limit'

    /**
     * A subscription window ran out. Not the code's fault, so no strike: wait
     * for the reset, checking for a stop request while waiting, unless the
     * reset is so far off that holding the machine would be worse.
     */
    const waitOut = async (limit: UsageLimit): Promise<'resume' | 'stop'> => {
      const until = limit.resetAt?.getTime() ?? Date.now() + DEFAULT_LIMIT_WAIT_MS
      const wait = until - Date.now()
      if (wait > MAX_LIMIT_WAIT_MS) {
        ui.warn(`Usage ${limit.detail} until ${new Date(until).toLocaleString()} — ending the run.`)
        return 'stop'
      }
      ui.warn(`Usage ${limit.detail} — waiting until ${new Date(until).toLocaleTimeString()}.`)
      appendFileSync(runLog, `\n[usage limit] ${limit.detail}, waiting ${Math.round(wait / 60_000)}m\n`)
      for (let waited = 0; waited < wait; waited += 60_000) {
        if (stopRequested()) return 'stop'
        await deps.sleep(Math.min(60_000, wait - waited))
      }
      return 'resume'
    }

    for (let i = 1; i <= maxLoops; i++) {
      // Dashboard edits land here, between iterations, never inside one.
      const changed = opts.refresh?.take() ?? { config: false, prd: false }
      if (changed.config) {
        cfg = effectiveConfig((await fetchConfig(project)).config)
        budget.setCaps(cfg.budgetPerRunUsd, cfg.budgetPerDayUsd)
        ui.info('Config changed in the dashboard — applied from this iteration.')
      }
      if (changed.prd && (await repo.syncFileFromBase(base, 'PRD.md'))) {
        ui.info(`PRD.md changed on ${base} — synced into this run.`)
      }

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
      const sick = await deps.preflight(needsLocalModel)
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
        await deps.sleep(wait)
        i--
        continue
      }

      ui.heading(`Iteration ${i}/${maxLoops}`)
      channel.progress({ runId: report.runId, project, branch, iteration: i, costUsd: budget.total })
      const openBefore = openTasks(cwd)
      if (openBefore.length === 0) {
        ended = 'complete'
        break
      }
      const task = openBefore[0]?.text ?? 'the highest-priority open task'

      appendFileSync(runLog, `\n--- iteration ${i} ---\n`)
      const request = (prompt: string) => ({
        cwd,
        prompt,
        conventions: conventions.text,
        conventionFiles: conventions.files,
        onOutput: (chunk: string) => channel.log(chunk),
      })

      // ---- plan (optional) ------------------------------------------------------
      let plan = ''
      if (planner) {
        ui.step(`Planning with ${planner.backend.id}…`)
        const planned = await planner.backend.plan({
          ...request(
            [
              `Plan the implementation of this task from PRD.md: ${task}`,
              '',
              'Do not change any file. Read what you need, then reply with a short,',
              'concrete plan: the files to change, what changes in each, and how the',
              'result will be checked. Follow the engineering conventions.',
              lastFailure,
            ].filter(Boolean).join('\n'),
          ),
          spec: planner.spec,
        })
        appendFileSync(runLog, planned.output)
        charge(planner, 'plan', planned)
        if (planned.limited) {
          if ((await waitOut(planned.limited)) === 'stop') {
            ended = 'usage-limit'
            break
          }
          i--
          continue
        }
        plan = planned.ok ? planned.text : ''
      }

      // ---- build ----------------------------------------------------------------
      const prompt = [
        `Implement ONLY this task: ${task}`,
        '',
        'Do NOT edit PRD.md — it is the human-owned specification and circon tracks',
        'completion separately. Do not commit; circon commits what passes its gate.',
        'Record what you did in progress.txt, ending with a line of the form:',
        '  COMPLETED: <the exact task text>',
        '',
        'Follow the engineering conventions (ARCHITECTURE.md). They are the standing',
        'contract and override your own defaults.',
        plan ? `\nA planning step proposed this approach:\n${plan}` : '',
        lastFailure,
        verifyNotes,
      ]
        .filter(Boolean)
        .join('\n')

      const built = await builder.backend.build({ ...request(prompt), spec: builder.spec })
      appendFileSync(runLog, built.output)
      charge(builder, 'build', built)

      if (built.limited) {
        // Half an edit is worse than none.
        await repo.hardReset()
        if ((await waitOut(built.limited)) === 'stop') {
          ended = 'usage-limit'
          break
        }
        i--
        continue
      }

      // The agent's own process died of something the machine did (Ollama gone,
      // network down): same as an infrastructure gate failure — no strike.
      const agentInfra = built.ok ? null : classifyFailure(built.output)
      if (agentInfra && infraRetries < INFRA_RETRY_LIMIT) {
        infraRetries++
        await repo.hardReset()
        const wait = backoffMs(infraRetries)
        ui.warn(`The agent failed on infrastructure: ${agentInfra.detail}. Retrying in ${wait / 1000}s…`)
        appendFileSync(runLog, `\n[infrastructure] ${agentInfra.detail}\n`)
        await deps.sleep(wait)
        i--
        continue
      }

      ui.step('Running the quality gate…')
      const gate = await deps.gate({
        cwd,
        ensureAndroidDevice,
        iosRunnerMode: cfg.iosRunnerMode,
        skipTiers: cfg.skipTiers,
      })
      appendFileSync(runLog, gate.output)
      channel.log(gate.output)
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
          await deps.sleep(wait)
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
          const done = inferCompletedTask(cwd, notes, openBefore)
          await repo.commit(done ? `feat: ${done.text}` : `chore: iteration ${i}`)
          const sha = await repo.head()
          if (done) {
            markComplete(cwd, done.text, sha ?? undefined)
            completed.push({ ...done, done: true })
            // The state file is part of the commit that completed the task.
            await repo.stageAll()
            if (await repo.hasStagedChanges()) await repo.commit(`chore: record ${done.text}`)
          }
          commits++
          stuck = 0
          ui.ok(done ? `Completed: ${done.text}` : `Committed iteration ${i}`)
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
        verifyNotes = await reviewNotes(`gate failure at the ${gate.failedTier} tier`)

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
        verifyNotes = await reviewNotes(`scheduled review at iteration ${i}`)
      }
    }

    // ---- wrap up -------------------------------------------------------------
    const commitSubjects = await repo.commitsSince(startCommit)
    if (commitSubjects.length === 0) {
      ui.warn('No commits produced — nothing to review.')
      ui.dim(budget.summary())
      report.outcome = ended === 'usage-limit' ? 'usage-limit' : 'no-commits'
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
      ...(settings?.dashboardUrl ? { runUrl: `${settings.dashboardUrl}/runs/${report.runId}` } : {}),
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
      case 'complete':    ui.ok('All PRD tasks complete.'); break
      case 'stopped':     ui.ok('Stopped on request.'); break
      case 'budget':      ui.warn('Stopped on budget.'); break
      case 'usage-limit': ui.warn('Stopped on a subscription usage limit.'); break
      default:            ui.ok(`Reached the iteration limit.`)
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
    const reclaimed = await deps.collect({ cwd })
    if (reclaimed.length) ui.dim(`gc: tidied ${reclaimed.length} thing(s)`)

    return 0
  } finally {
    await emulator.release()
    if (report) {
      // No outcome means something threw. Recording that is the point.
      report.outcome ??= 'aborted'
      await reportRun(report)
      channel.finished({
        runId: report.runId,
        outcome: report.outcome,
        costUsd: report.costUsd ?? 0,
        ...(report.prUrl ? { prUrl: report.prUrl } : {}),
      })
    }
    setOutputSink(null)
    releaseLock()
    clearStop()
  }
}

