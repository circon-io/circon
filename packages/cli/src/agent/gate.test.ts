import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { runGate, type GateDeps, type TierName } from './gate.ts'

/**
 * Parity tests against the behaviours verified for the original bash `run_gate`
 * with fixture directories. Same cases, now without needing a real toolchain.
 */

interface Scenario {
  files: Record<string, string>
  binaries?: string[]
  /** Commands that should fail, matched on "cmd arg arg". */
  failing?: string[]
  adbOutput?: string
}

function harness(s: Scenario): GateDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    cwd: '/fake',
    calls,
    fileExists: (p: string) => p in s.files,
    readFile: (p: string) => s.files[p] ?? '',
    hasBinary: async (n: string) => (s.binaries ?? []).includes(n),
    exec: async (cmd: string, args: string[]) => {
      const key = [cmd, ...args].join(' ')
      if (cmd === 'adb') return { ok: true, output: s.adbOutput ?? '' }
      calls.push(key)
      const fails = (s.failing ?? []).some((f) => key.includes(f))
      return { ok: !fails, output: fails ? `FAILED: ${key}\n` : `ok: ${key}\n` }
    },
  }
}

describe('tier selection', () => {
  test('a project with none of the files runs nothing and passes', async () => {
    const h = harness({ files: {} })
    const r = await runGate(h)
    assert.equal(r.ok, true)
    assert.equal(r.failedTier, null)
    assert.deepEqual(r.ranTiers, [])
    assert.deepEqual(h.calls, [], 'must not execute anything')
  })

  test('package.json without a test script skips the unit tier', async () => {
    const h = harness({ files: { 'package.json': '{"scripts":{"build":"tsc"}}' } })
    const r = await runGate(h)
    assert.deepEqual(r.ranTiers, [])
    assert.equal(r.ok, true)
  })

  test('package.json with a test script runs it', async () => {
    const h = harness({ files: { 'package.json': '{"scripts":{"test":"vitest"}}' } })
    const r = await runGate(h)
    assert.deepEqual(r.ranTiers, ['unit tests' as TierName])
    assert.deepEqual(h.calls, ['npm test'])
  })

  test('tsconfig without a local tsc skips typecheck, never downloads one', async () => {
    const h = harness({
      files: { 'tsconfig.json': '{}', 'package.json': '{"scripts":{"test":"vitest"}}' },
    })
    const r = await runGate(h)
    assert.deepEqual(r.ranTiers, ['unit tests' as TierName])
  })

  test('malformed package.json does not crash the gate', async () => {
    const h = harness({ files: { 'package.json': '{not json' } })
    const r = await runGate(h)
    assert.equal(r.ok, true)
    assert.deepEqual(r.ranTiers, [])
  })
})

describe('ordering and short-circuit', () => {
  test('typecheck runs before unit tests and stops the run when it fails', async () => {
    const h = harness({
      files: {
        'tsconfig.json': '{}',
        'node_modules/.bin/tsc': '',
        'package.json': '{"scripts":{"test":"vitest"}}',
      },
      failing: ['tsc --noEmit'],
    })
    const r = await runGate(h)
    assert.equal(r.ok, false)
    assert.equal(r.failedTier, 'typecheck')
    assert.deepEqual(r.ranTiers, ['typecheck'])
    assert.ok(!h.calls.some((c) => c.includes('test')), 'unit tier must not run after a failure')
  })

  test('a passing typecheck lets the unit tier run', async () => {
    const h = harness({
      files: {
        'tsconfig.json': '{}',
        'node_modules/.bin/tsc': '',
        'package.json': '{"scripts":{"test":"vitest"}}',
      },
    })
    const r = await runGate(h)
    assert.equal(r.ok, true)
    assert.deepEqual(r.ranTiers, ['typecheck', 'unit tests'])
  })
})

describe('package manager detection', () => {
  test('pnpm workspace uses pnpm', async () => {
    const h = harness({
      files: { 'package.json': '{"scripts":{"test":"vitest"}}', 'pnpm-workspace.yaml': '' },
    })
    await runGate(h)
    assert.deepEqual(h.calls, ['pnpm test'])
  })

  test('a pnpm lockfile alone is enough', async () => {
    const h = harness({
      files: { 'package.json': '{"scripts":{"test":"vitest"}}', 'pnpm-lock.yaml': '' },
    })
    await runGate(h)
    assert.deepEqual(h.calls, ['pnpm test'])
  })
})

describe('UI tiers', () => {
  test('web flow is skipped when agent-device is absent', async () => {
    const h = harness({ files: { '.circon/flows/web.sh': '' }, binaries: [] })
    const r = await runGate(h)
    assert.deepEqual(r.ranTiers, [], 'must not run a UI flow without the driver')
    assert.equal(r.ok, true)
  })

  test('web flow runs when the driver is present, and its failure is attributed', async () => {
    const h = harness({
      files: { '.circon/flows/web.sh': '' },
      binaries: ['agent-device'],
      failing: ['web.sh'],
    })
    const r = await runGate(h)
    assert.equal(r.ok, false)
    assert.equal(r.failedTier, 'web UI')
    assert.match(r.output, /FAILED/)
  })

  test('android flow is skipped when no device is attached', async () => {
    const h = harness({
      files: { '.circon/flows/android.sh': '' },
      binaries: ['agent-device'],
      adbOutput: 'List of devices attached\n\n',
    })
    const r = await runGate(h)
    assert.deepEqual(r.ranTiers, [])
  })

  test('android flow runs when a device is attached', async () => {
    const h = harness({
      files: { '.circon/flows/android.sh': '' },
      binaries: ['agent-device'],
      adbOutput: 'List of devices attached\nemulator-5554\tdevice\n',
    })
    const r = await runGate(h)
    assert.deepEqual(r.ranTiers, ['android UI'])
  })

  test('an offline device does not count as attached', async () => {
    const h = harness({
      files: { '.circon/flows/android.sh': '' },
      binaries: ['agent-device'],
      adbOutput: 'List of devices attached\nemulator-5554\toffline\n',
    })
    const r = await runGate(h)
    assert.deepEqual(r.ranTiers, [])
  })

  test('web failure short-circuits before android', async () => {
    const h = harness({
      files: { '.circon/flows/web.sh': '', '.circon/flows/android.sh': '' },
      binaries: ['agent-device'],
      adbOutput: 'List of devices attached\nemulator-5554\tdevice\n',
      failing: ['web.sh'],
    })
    const r = await runGate(h)
    assert.equal(r.failedTier, 'web UI')
    assert.ok(!h.calls.some((c) => c.includes('android.sh')))
  })
})
