import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AndroidEmulator, attachedDevices, type EmulatorDeps } from './emulator.ts'

interface Fake {
  deps: EmulatorDeps
  calls: string[]
  spawned: string[]
  killed: number
}

/**
 * `bootAfter` is how many `adb devices` polls pass before the spawned emulator
 * shows up; Infinity means it never boots.
 */
function fake(opts: { attached?: boolean; avds?: string[]; emulator?: boolean; bootAfter?: number }): Fake {
  const state: Fake = { calls: [], spawned: [], killed: 0, deps: undefined as unknown as EmulatorDeps }
  let polls = 0
  state.deps = {
    exec: async (cmd, args) => {
      const key = [cmd, ...args].join(' ')
      state.calls.push(key)
      if (key === 'adb devices') {
        if (opts.attached) return { ok: true, output: 'List of devices attached\nR58M\tdevice\n' }
        if (state.spawned.length && ++polls > (opts.bootAfter ?? 1)) {
          return { ok: true, output: 'List of devices attached\nemulator-5554\tdevice\n' }
        }
        return { ok: true, output: 'List of devices attached\n\n' }
      }
      if (key === 'emulator -list-avds') return { ok: true, output: (opts.avds ?? []).join('\n') }
      if (key.endsWith('getprop sys.boot_completed')) return { ok: true, output: '1\n' }
      return { ok: true, output: '' }
    },
    hasBinary: async (name) => name !== 'emulator' || opts.emulator !== false,
    spawnDetached: (cmd, args) => {
      state.spawned.push([cmd, ...args].join(' '))
      return { kill: async () => { state.killed++ } }
    },
    sleep: async () => {},
  }
  return state
}

describe('parsing adb devices', () => {
  test('only fully attached devices count', () => {
    const out = [
      'List of devices attached',
      'emulator-5554\tdevice',
      'R58M\tunauthorized',
      'emulator-5556\toffline',
      '',
    ].join('\n')
    assert.deepEqual(attachedDevices(out), ['emulator-5554'])
  })
})

describe('android emulator', () => {
  test('a device the human attached is used as is, and never killed', async () => {
    const f = fake({ attached: true, avds: ['circon_pixel'] })
    const emu = new AndroidEmulator({ deps: f.deps })
    assert.deepEqual(await emu.ensure(), { ok: true, started: false })
    await emu.release()
    assert.equal(f.spawned.length, 0)
    assert.equal(f.killed, 0)
  })

  test('boots the AVD headless when nothing is attached', async () => {
    const f = fake({ avds: ['circon_pixel'] })
    const emu = new AndroidEmulator({ deps: f.deps })
    assert.deepEqual(await emu.ensure(), { ok: true, started: true })
    assert.equal(f.spawned.length, 1)
    assert.match(f.spawned[0] ?? '', /-avd circon_pixel .*-no-window/)
  })

  test('release kills only the emulator it started', async () => {
    const f = fake({ avds: ['circon_pixel'] })
    const emu = new AndroidEmulator({ deps: f.deps })
    await emu.ensure()
    await emu.release()
    assert.equal(f.killed, 1)
    assert.ok(f.calls.includes('adb -s emulator-5554 emu kill'))
    await emu.release()
    assert.equal(f.killed, 1, 'a second release is a no-op')
  })

  test('a second ensure reuses the booted device', async () => {
    const f = fake({ avds: ['circon_pixel'] })
    const emu = new AndroidEmulator({ deps: f.deps })
    await emu.ensure()
    assert.deepEqual(await emu.ensure(), { ok: true, started: false })
    assert.equal(f.spawned.length, 1)
  })

  test('explains a missing AVD instead of hanging', async () => {
    const f = fake({ avds: ['someone_elses'] })
    const r = await new AndroidEmulator({ deps: f.deps }).ensure()
    assert.equal(r.ok, false)
    assert.match(r.reason ?? '', /circon_pixel/)
    assert.equal(f.spawned.length, 0)
  })

  test('explains a missing emulator binary', async () => {
    const f = fake({ emulator: false })
    const r = await new AndroidEmulator({ deps: f.deps }).ensure()
    assert.equal(r.ok, false)
    assert.match(r.reason ?? '', /android-sdk/)
  })

  test('gives up after the boot timeout and cleans up', async () => {
    const f = fake({ avds: ['circon_pixel'], bootAfter: Infinity })
    const emu = new AndroidEmulator({ deps: f.deps, bootTimeoutMs: 9_000 })
    const r = await emu.ensure()
    assert.equal(r.ok, false)
    assert.match(r.reason ?? '', /did not finish booting/)
    assert.equal(f.killed, 1)
  })
})
