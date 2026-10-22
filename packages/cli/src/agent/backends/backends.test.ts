import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { detectUsageLimit, nextOccurrence } from './limits.ts'
import { aiderBuildArgs, aiderAskArgs } from './aider.ts'
import { claudeBuildArgs, claudeReadOnlyArgs, claudeCodeBackend, parseClaudeOutput } from './claude-code.ts'
import { codexArgs, parseCodexEvents, codexBackend } from './codex.ts'
import { resolveRoles } from './index.ts'
import type { AgentRequest, Exec } from './types.ts'
import type { RunOptions, RunResult } from '../../core/exec.ts'
import { effectiveConfig } from '../../core/config.ts'

const req = (over: Partial<AgentRequest> = {}): AgentRequest => ({
  cwd: '/p',
  prompt: 'Implement ONLY this task: sign in',
  conventions: 'Never weaken a check.',
  conventionFiles: ['/c/ARCHITECTURE.md'],
  spec: { backend: 'claude-code' },
  ...over,
})

function fakeExec(answer: (cmd: string, args: string[], opts?: RunOptions) => Partial<RunResult>) {
  const calls: Array<{ cmd: string; args: string[]; opts?: RunOptions }> = []
  const exec: Exec = async (cmd, args, opts) => {
    calls.push({ cmd, args, ...(opts ? { opts } : {}) })
    const r = answer(cmd, args, opts)
    return { code: r.ok === false ? 1 : 0, stdout: '', stderr: '', ok: true, ...r }
  }
  return { exec, calls }
}

describe('usage limits', () => {
  const now = new Date('2026-10-22T10:00:00')

  test('a clock time resets later today, or tomorrow once passed', () => {
    assert.equal(nextOccurrence('3:45pm', now)?.toString(), new Date('2026-10-22T15:45:00').toString())
    assert.equal(nextOccurrence('9am', now)?.toString(), new Date('2026-10-23T09:00:00').toString())
  })

  test('a weekday resets on the next one', () => {
    // 2026-10-22 is a Thursday.
    assert.equal(nextOccurrence('Mon 12:00am', now)?.toString(), new Date('2026-10-26T00:00:00').toString())
  })

  test("Claude Code's session limit message", () => {
    const hit = detectUsageLimit("You've hit your session limit · resets 3:45pm", now)
    assert.equal(hit?.detail, 'session limit')
    assert.equal(hit?.resetAt?.getHours(), 15)
  })

  test('the older epoch form', () => {
    const hit = detectUsageLimit('Claude AI usage limit reached|1760000000', now)
    assert.equal(hit?.resetAt?.getTime(), 1_760_000_000_000)
  })

  test("Codex's try-again form", () => {
    const hit = detectUsageLimit("You've hit your usage limit. Try again in 1 hour 30 minutes.", now)
    assert.equal(hit?.resetAt?.getTime(), now.getTime() + 90 * 60_000)
  })

  test('ordinary output is not a limit', () => {
    assert.equal(detectUsageLimit('Applied edit to src/app.tsx', now), null)
  })
})

describe('aider', () => {
  test('builds as architect with a local editor by default', () => {
    const args = aiderBuildArgs(req({ spec: { backend: 'aider' } }))
    assert.deepEqual(args.slice(0, 5), ['progress.txt', '--read', '/c/ARCHITECTURE.md', '--read', 'PRD.md'])
    assert.ok(args.includes('--architect'))
    assert.equal(args[args.indexOf('--editor-model') + 1], 'ollama_chat/qwen2.5-coder:7b')
    assert.ok(args.includes('--no-auto-commits'))
  })

  test('plans and reviews in ask mode, which edits nothing', () => {
    const args = aiderAskArgs(req({ spec: { backend: 'aider', model: 'opus' } }))
    assert.equal(args[args.indexOf('--chat-mode') + 1], 'ask')
    assert.ok(!args.includes('--architect'))
  })
})

describe('claude code', () => {
  test('build may edit and run scripts, never commit or push', () => {
    const args = claudeBuildArgs(req({ spec: { backend: 'claude-code', model: 'opus' } }))
    assert.equal(args[args.indexOf('--model') + 1], 'opus')
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'acceptEdits')
    const denied = args.slice(args.indexOf('--disallowedTools') + 1, args.indexOf('--max-turns'))
    assert.ok(denied.includes('Bash(git commit *)'))
    assert.ok(denied.includes('Bash(git push *)'))
    assert.match(args[args.indexOf('--append-system-prompt') + 1] ?? '', /Never weaken a check/)
  })

  test('plan and review get read-only tools', () => {
    const args = claudeReadOnlyArgs(req())
    assert.equal(args[args.indexOf('--permission-mode') + 1], 'default')
    const tools = args.slice(args.indexOf('--allowedTools') + 1)
    assert.ok(!tools.includes('Edit') && !tools.includes('Write'))
    assert.ok(tools.includes('Read'))
  })

  test('reads result and cost from the json output', () => {
    const parsed = parseClaudeOutput('warning: something\n{"result":"CLEAN","total_cost_usd":0.12,"subtype":"success"}')
    assert.equal(parsed?.result, 'CLEAN')
    assert.equal(parsed?.total_cost_usd, 0.12)
  })

  test('with subscription credentials, the API key is kept out of its environment', async () => {
    const { exec, calls } = fakeExec((_cmd, args) =>
      args[0] === 'auth'
        ? { stdout: '{"authMethod":"oauth_token"}' }
        : { stdout: '{"result":"done","total_cost_usd":1.5,"subtype":"success"}' },
    )
    const result = await claudeCodeBackend(exec).build(req())
    assert.equal(result.ok, true)
    assert.equal(result.costUsd, 1.5)
    const build = calls.find((c) => c.args[0] !== 'auth')
    assert.deepEqual(build?.opts?.unsetEnv, ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'])
  })

  test('without a subscription, it bills the API key as configured', async () => {
    const { exec, calls } = fakeExec((_cmd, args) =>
      args[0] === 'auth' ? { ok: false, stdout: '{"authMethod":"none"}' } : { stdout: '{"result":"ok","subtype":"success"}' },
    )
    await claudeCodeBackend(exec).build(req())
    assert.equal(calls.find((c) => c.args[0] !== 'auth')?.opts?.unsetEnv, undefined)
  })

  test('a hit session limit is reported as a limit, not a failure of the code', async () => {
    const { exec } = fakeExec((_cmd, args) =>
      args[0] === 'auth'
        ? { stdout: '{"authMethod":"claude.ai"}' }
        : { ok: false, stdout: '{"result":"You\'ve hit your session limit · resets 3:45pm","subtype":"error_during_execution","is_error":true}' },
    )
    const result = await claudeCodeBackend(exec).build(req())
    assert.equal(result.ok, false)
    assert.equal(result.limited?.detail, 'session limit')
  })
})

describe('codex', () => {
  test('never waits for approval, writes only in the workspace', () => {
    const args = codexArgs(req({ spec: { backend: 'codex', model: 'gpt-5-codex' } }), 'build', '/tmp/x')
    assert.deepEqual(args.slice(0, 3), ['--ask-for-approval', 'never', 'exec'])
    assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write')
    assert.equal(args[args.indexOf('--model') + 1], 'gpt-5-codex')
    assert.match(args.at(-1) ?? '', /^Engineering conventions[\s\S]*Implement ONLY this task/)
  })

  test('review is read-only', () => {
    const args = codexArgs(req({ spec: { backend: 'codex' } }), 'read', '/tmp/x')
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only')
    assert.ok(!args.includes('--model'))
  })

  test('reads the last agent message from either event shape', () => {
    const out = [
      '{"type":"thread.started","thread_id":"t"}',
      '{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"first"}}',
      '{"type":"item.completed","item":{"id":"2","item_type":"assistant_message","text":"CLEAN"}}',
      '{"type":"turn.completed","usage":{"input_tokens":10,"cached_input_tokens":0,"output_tokens":2}}',
    ].join('\n')
    assert.deepEqual(parseCodexEvents(out), { lastMessage: 'CLEAN', errors: [] })
  })

  test('a usage-limit error is a limit; a build that mentions rate limiting is not', async () => {
    const limited = fakeExec(() => ({
      ok: false,
      stdout: '{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit. Try again in 2 hours."}}',
    }))
    assert.ok((await codexBackend(limited.exec).build(req({ spec: { backend: 'codex' } }))).limited)

    const fine = fakeExec(() => ({
      stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"Added a rate limit to /login"}}',
    }))
    const result = await codexBackend(fine.exec).build(req({ spec: { backend: 'codex' } }))
    assert.equal(result.ok, true)
    assert.equal(result.limited, undefined)
  })
})

describe('roles', () => {
  test('with nothing configured, the loop is what it always was', () => {
    const roles = resolveRoles(effectiveConfig(null, {}))
    assert.equal(roles.plan, null)
    assert.equal(roles.build.backend, 'aider')
    assert.deepEqual(roles.review, { backend: 'claude-code', model: 'sonnet' })
  })

  test('plan with one vendor, build with another, review with a third', () => {
    const roles = resolveRoles(effectiveConfig({
      agents: {
        plan: { backend: 'claude-code', model: 'fable' },
        build: { backend: 'claude-code', model: 'opus' },
        review: { backend: 'codex' },
      },
    }, {}))
    assert.deepEqual(roles.plan, { backend: 'claude-code', model: 'fable' })
    assert.equal(roles.review.backend, 'codex')
  })
})
