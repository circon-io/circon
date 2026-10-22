import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { runCommand, type RunDeps } from './run.ts'
import type { AgentBackend, AgentRequest, AgentResult, Backends } from '../agent/backends/index.ts'
import type { GateResult } from '../agent/gate.ts'
import type { AgentBackendId } from '../core/config.ts'

/**
 * The loop against a real git repository, with the agents and the gate faked.
 * What is under test is the loop's own decisions: what gets committed, what
 * gets reverted, when it stops, and what it charges.
 */

let home = ''
let project = ''
let previousCwd = ''
const previousHome = process.env['CIRCON_HOME']

function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: project, encoding: 'utf8' })
}

function prd(tasks: string[]) {
  writeFileSync(join(project, 'PRD.md'), `# PRD\n\n## Task Backlog\n${tasks.map((t) => `- [ ] ${t}`).join('\n')}\n`)
  git('add', '-A')
  git('commit', '-qm', 'docs: prd')
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'circon-run-'))
  project = join(home, 'acme__shop')
  mkdirSync(project)
  process.env['CIRCON_HOME'] = home
  execFileSync('git', ['init', '-q', '-b', 'main', project])
  previousCwd = process.cwd()
  process.chdir(project)
})

afterEach(() => {
  process.chdir(previousCwd)
  if (previousHome === undefined) delete process.env['CIRCON_HOME']
  else process.env['CIRCON_HOME'] = previousHome
  rmSync(home, { recursive: true, force: true })
})

type Step = (req: AgentRequest) => Partial<AgentResult>

/** Writes a file and reports the task done, like a well-behaved agent. */
const doesTheTask: Step = (req) => {
  const task = /Implement ONLY this task: (.+)/.exec(req.prompt)?.[1] ?? 'unknown'
  writeFileSync(join(req.cwd, `${task.replace(/\W+/g, '-')}.txt`), task)
  appendFileSync(join(req.cwd, 'progress.txt'), `did it\nCOMPLETED: ${task}\n`)
  return { costUsd: 0.5 }
}

function backend(id: AgentBackendId, build: Step, opts: { billing?: 'api' | 'subscription'; plan?: Step } = {}) {
  const calls: Array<{ role: string; prompt: string }> = []
  const result = (r: Partial<AgentResult>): AgentResult => ({ ok: true, output: '', text: '', costUsd: null, ...r })
  const b: AgentBackend = {
    id,
    needsLocalModel: () => false,
    available: async () => ({ ok: true, billing: opts.billing ?? 'api' }),
    build: async (req) => {
      calls.push({ role: 'build', prompt: req.prompt })
      return result(build(req))
    },
    plan: async (req) => {
      calls.push({ role: 'plan', prompt: req.prompt })
      return result(opts.plan ? opts.plan(req) : { text: 'touch one file' })
    },
    review: async (req) => {
      calls.push({ role: 'review', prompt: req.prompt })
      return result({ text: 'CLEAN' })
    },
  }
  return { backend: b, calls }
}

function deps(build: AgentBackend, gate: (n: number) => Partial<GateResult> = () => ({}), extra: Partial<Backends> = {}) {
  let gates = 0
  const sleeps: number[] = []
  const d: Partial<RunDeps> = {
    backends: { 'aider': build, 'claude-code': build, 'codex': build, ...extra } as Backends,
    gate: async () => ({ ok: true, failedTier: null, output: '', ranTiers: ['unit tests'], ...gate(++gates) }),
    preflight: async () => null,
    sleep: async (ms) => { sleeps.push(ms) },
    collect: async () => [],
  }
  return { d, sleeps, gateCount: () => gates }
}

const subjects = () => git('log', '--format=%s').trim().split('\n')

describe('the loop', () => {
  test('commits each task that passes the gate, named after the task', async () => {
    prd(['add a cart', 'add checkout'])
    const { backend: b } = backend('claude-code', doesTheTask)
    const code = await runCommand(5, { config: { agents: { build: { backend: 'claude-code' } } } }, deps(b).d)
    assert.equal(code, 0)
    const log = subjects()
    assert.ok(log.includes('feat: add a cart'))
    assert.ok(log.includes('feat: add checkout'))
    const progress = JSON.parse(readFileSync(join(project, '.circon', 'progress.json'), 'utf8')) as { completed: Record<string, unknown> }
    assert.equal(Object.keys(progress.completed).length, 2)
  })

  test('reverts a failing iteration and trips the breaker after three', async () => {
    prd(['add a cart'])
    const { backend: b } = backend('claude-code', doesTheTask)
    const { d } = deps(b, () => ({ ok: false, failedTier: 'unit tests', output: 'AssertionError: expected 2' }))
    const code = await runCommand(10, { config: { agents: { build: { backend: 'claude-code' } } } }, d)
    assert.equal(code, 1)
    assert.ok(!subjects().some((s) => s.startsWith('feat:')), 'nothing failing was committed')
    assert.equal(git('status', '--porcelain').trim(), '', 'the working tree was reset')
  })

  test('an infrastructure failure is retried without a strike', async () => {
    prd(['add a cart'])
    const { backend: b } = backend('claude-code', doesTheTask)
    const { d, sleeps } = deps(b, (n) => (n <= 2 ? { ok: false, failedTier: 'unit tests', output: 'Error: connect ECONNREFUSED 127.0.0.1:11434' } : {}))
    const code = await runCommand(3, { config: { agents: { build: { backend: 'claude-code' } } } }, d)
    assert.equal(code, 0)
    assert.ok(subjects().includes('feat: add a cart'))
    assert.equal(sleeps.length, 2)
  })

  test('an agent killed by the machine is retried, not sent to the gate', async () => {
    prd(['add a cart'])
    let calls = 0
    const { backend: b } = backend('claude-code', (req) => {
      calls++
      return calls === 1 ? { ok: false, output: 'Error: connect ECONNREFUSED 127.0.0.1:11434' } : doesTheTask(req)
    })
    const { d, gateCount } = deps(b)
    const code = await runCommand(2, { config: { agents: { build: { backend: 'claude-code' } } } }, d)
    assert.equal(code, 0)
    assert.equal(gateCount(), 1)
    assert.ok(subjects().includes('feat: add a cart'))
  })

  test('a usage limit waits for the reset instead of counting as a failure', async () => {
    prd(['add a cart'])
    let calls = 0
    const { backend: b } = backend('claude-code', (req) => {
      calls++
      if (calls === 1) {
        writeFileSync(join(req.cwd, 'half-done.txt'), 'partial')
        return { ok: false, limited: { detail: 'session limit', resetAt: new Date(Date.now() + 120_000) } }
      }
      return doesTheTask(req)
    }, { billing: 'subscription' })
    const { d, sleeps, gateCount } = deps(b)
    const code = await runCommand(2, { config: { agents: { build: { backend: 'claude-code' } } } }, d)
    assert.equal(code, 0)
    assert.ok(subjects().includes('feat: add a cart'))
    assert.ok(sleeps.length >= 2, 'waited in steps, checking for a stop between them')
    assert.equal(gateCount(), 1, 'the limited attempt never reached the gate')
    assert.ok(!git('ls-files').includes('half-done.txt'), 'the partial edit was discarded')
  })

  test('a limit that lifts days from now ends the run rather than holding the machine', async () => {
    prd(['add a cart'])
    const { backend: b } = backend('claude-code', () => ({
      ok: false,
      limited: { detail: 'weekly limit', resetAt: new Date(Date.now() + 3 * 86_400_000) },
    }), { billing: 'subscription' })
    const { d, sleeps } = deps(b)
    const code = await runCommand(5, { config: { agents: { build: { backend: 'claude-code' } } } }, d)
    assert.equal(code, 0)
    assert.equal(sleeps.length, 0)
  })

  test('the planning step runs first and its plan reaches the builder', async () => {
    prd(['add a cart'])
    const builder = backend('claude-code', doesTheTask)
    const planner = backend('codex', doesTheTask, { plan: () => ({ text: 'Edit src/cart.ts only.' }) })
    const { d } = deps(builder.backend, () => ({}), { codex: planner.backend })
    await runCommand(1, {
      config: { agents: { plan: { backend: 'codex' }, build: { backend: 'claude-code' } } },
    }, d)
    assert.equal(planner.calls[0]?.role, 'plan')
    assert.match(builder.calls[0]?.prompt ?? '', /Edit src\/cart\.ts only\./)
  })

  test('subscription usage is recorded as notional and never stops the run on budget', async () => {
    prd(['a', 'b', 'c'])
    const { backend: b } = backend('claude-code', (req) => ({ ...doesTheTask(req), costUsd: 100 }), { billing: 'subscription' })
    const code = await runCommand(5, {
      config: { budgetPerRunUsd: 1, agents: { build: { backend: 'claude-code' } } },
    }, deps(b).d)
    assert.equal(code, 0)
    assert.equal(subjects().filter((s) => s.startsWith('feat:')).length, 3)
  })

  test('API spend over the run cap stops the loop between iterations', async () => {
    prd(['a', 'b', 'c'])
    const { backend: b } = backend('claude-code', (req) => ({ ...doesTheTask(req), costUsd: 2 }))
    await runCommand(5, {
      config: { budgetPerRunUsd: 1, agents: { build: { backend: 'claude-code' } } },
    }, deps(b).d)
    assert.equal(subjects().filter((s) => s.startsWith('feat:')).length, 1)
  })

  test('a PRD edited on main mid-run is synced in at the next iteration', async () => {
    const origin = join(home, 'origin.git')
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin])
    prd(['add a cart', 'add checkout'])
    git('remote', 'add', 'origin', origin)
    git('push', '-q', 'origin', 'main')
    git('remote', 'set-head', 'origin', 'main')

    // A human edits the PRD on main while the run is going.
    const human = join(home, 'human')
    execFileSync('git', ['clone', '-q', origin, human])
    let synced = false
    const signals = {
      take: () => {
        if (synced) return { config: false, prd: false }
        synced = true
        writeFileSync(join(human, 'PRD.md'), '# PRD\n\n## Task Backlog\n- [ ] add a cart\n- [ ] add checkout\n- [ ] add a wishlist\n')
        execFileSync('git', ['-C', human, '-c', 'user.name=h', '-c', 'user.email=h@h', 'commit', '-qam', 'docs: more'])
        execFileSync('git', ['-C', human, 'push', '-q', 'origin', 'main'])
        return { config: false, prd: true }
      },
    }
    const { backend: b } = backend('claude-code', doesTheTask)
    await runCommand(5, { refresh: signals, config: { agents: { build: { backend: 'claude-code' } } } }, deps(b).d)
    const log = subjects()
    assert.ok(log.includes('chore: sync PRD.md from main'))
    assert.ok(log.includes('feat: add a wishlist'), 'the task added mid-run was built')
  })

  test('preparation is committed on the run branch before the first task', async () => {
    prd(['add a cart'])
    const { backend: b } = backend('claude-code', doesTheTask)
    await runCommand(1, {
      config: { agents: { build: { backend: 'claude-code' } } },
      prepare: async (cwd) => {
        writeFileSync(join(cwd, 'scaffolded.txt'), 'template')
        return true
      },
    }, deps(b).d)
    const log = subjects()
    assert.ok(log.indexOf('chore: scaffold from the circon template') > log.indexOf('feat: add a cart'), 'scaffold comes first')
    assert.equal(git('show', 'main:PRD.md').includes('add a cart'), true)
    assert.ok(!git('ls-tree', '--name-only', 'main').includes('scaffolded.txt'), 'main is untouched; the PR carries it')
  })

  test("a job's secrets are visible to the agent during the run and gone after it", async () => {
    prd(['add a cart'])
    let seen: string | undefined
    const { backend: b } = backend('claude-code', (req) => {
      seen = process.env['CLOUDFLARE_API_TOKEN']
      return doesTheTask(req)
    })
    const before = process.env['CLOUDFLARE_API_TOKEN']
    await runCommand(1, {
      config: { agents: { build: { backend: 'claude-code' } } },
      secrets: { CLOUDFLARE_API_TOKEN: 'cf-job-only' },
    }, deps(b).d)
    assert.equal(seen, 'cf-job-only')
    assert.equal(process.env['CLOUDFLARE_API_TOKEN'], before)
  })

  test('refuses to start when the build backend cannot run', async () => {
    prd(['add a cart'])
    const { backend: b } = backend('claude-code', doesTheTask)
    const broken: AgentBackend = { ...b, available: async () => ({ ok: false, billing: 'api', reason: 'not logged in' }) }
    const code = await runCommand(1, { config: { agents: { build: { backend: 'claude-code' } } } }, deps(broken).d)
    assert.equal(code, 1)
  })
})
