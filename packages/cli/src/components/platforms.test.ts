import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { components, validateOrdering } from './registry.ts'
import { launchdPlistXml } from './workspace.ts'
import { envFileLines } from './system.ts'

describe('platforms', () => {
  test('every component says where it applies', () => {
    for (const c of components) {
      assert.ok(c.platforms.length > 0, `${c.id} applies nowhere`)
      assert.ok(c.platforms.every((p) => p === 'linux' || p === 'darwin'), `${c.id} names an unknown platform`)
    }
  })

  test('both platforms can run the loop and test the app', () => {
    const needed = ['node', 'js-globals', 'aider', 'android-sdk', 'ollama', 'ollama-model', 'workspace', 'conventions', 'agent-service']
    for (const platform of ['linux', 'darwin'] as const) {
      for (const id of needed) {
        const c = components.find((x) => x.id === id)
        assert.ok(c?.platforms.includes(platform), `${id} is missing on ${platform}`)
      }
    }
    assert.ok(components.find((c) => c.id === 'ios-simulator')?.platforms.includes('darwin'))
    assert.ok(components.find((c) => c.id === 'ios-device')?.platforms.includes('linux'))
  })

  test('install order still holds with the macOS components', () => {
    assert.doesNotThrow(() => validateOrdering())
  })
})

describe('macOS specifics', () => {
  test('the LaunchAgent escapes what it embeds and restarts the agent', () => {
    const plist = launchdPlistXml('/opt/homebrew/bin/circon', '/Users/a&b/logs', '/opt/homebrew/bin:/usr/bin')
    assert.match(plist, /<string>\/opt\/homebrew\/bin\/circon<\/string><string>agent<\/string>/)
    assert.match(plist, /<key>KeepAlive<\/key><true\/>/)
    assert.match(plist, /\/Users\/a&amp;b\/logs/)
  })

  test("the shell environment points at each platform's SDK location", () => {
    assert.ok(envFileLines('darwin').some((l) => l.includes('Library/Android/sdk')))
    assert.ok(envFileLines('darwin').some((l) => l.includes('JAVA_HOME')))
    assert.ok(envFileLines('linux').some((l) => l.includes('$HOME/Android/Sdk')))
    assert.ok(!envFileLines('linux').some((l) => l.includes('JAVA_HOME')))
  })
})
