import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadCredentials, writeEnvFile, effectiveConfig, readConfig } from './config.ts'
import { writeFileSync, mkdirSync } from 'node:fs'

let home = ''
const previousHome = process.env['CIRCON_HOME']

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'circon-config-'))
  process.env['CIRCON_HOME'] = home
})

after(() => {
  if (previousHome === undefined) delete process.env['CIRCON_HOME']
  else process.env['CIRCON_HOME'] = previousHome
  rmSync(home, { recursive: true, force: true })
})

describe('loading credentials', () => {
  test('a key written by circon config reaches the environment', () => {
    writeEnvFile('anthropic', { ANTHROPIC_API_KEY: 'sk-from-file' })
    const env: NodeJS.ProcessEnv = {}
    assert.deepEqual(loadCredentials(['anthropic'], env), ['ANTHROPIC_API_KEY'])
    assert.equal(env['ANTHROPIC_API_KEY'], 'sk-from-file')
  })

  test('an explicitly exported variable wins over the file', () => {
    writeEnvFile('anthropic', { ANTHROPIC_API_KEY: 'sk-from-file' })
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-from-shell' }
    assert.deepEqual(loadCredentials(['anthropic'], env), [])
    assert.equal(env['ANTHROPIC_API_KEY'], 'sk-from-shell')
  })

  test('a missing file is not an error', () => {
    const env: NodeJS.ProcessEnv = {}
    assert.deepEqual(loadCredentials(['openai'], env), [])
  })

  test('project credentials are not loaded by default', () => {
    // The agent process must never hold a deploy token.
    writeEnvFile('project', { CLOUDFLARE_API_TOKEN: 'cf-secret' })
    const env: NodeJS.ProcessEnv = {}
    loadCredentials(undefined, env)
    assert.equal(env['CLOUDFLARE_API_TOKEN'], undefined)
  })
})

describe('effective config', () => {
  test('with nothing remote, local settings win over defaults', () => {
    const cfg = effectiveConfig(null, { budgetPerRunUsd: 3 })
    assert.equal(cfg.budgetPerRunUsd, 3)
    assert.equal(cfg.verifyEvery, 5)
  })

  test('the dashboard snapshot overrides only what it sets', () => {
    const cfg = effectiveConfig({ budgetPerRunUsd: 2 }, { budgetPerRunUsd: 3, budgetPerDayUsd: 7 })
    assert.equal(cfg.budgetPerRunUsd, 2)
    assert.equal(cfg.budgetPerDayUsd, 7)
  })

  test('agents merge role by role', () => {
    const cfg = effectiveConfig(
      { agents: { build: { backend: 'claude-code', model: 'opus' } } },
      { agents: { build: { backend: 'aider' }, review: { backend: 'codex' } } },
    )
    assert.deepEqual(cfg.agents, {
      build: { backend: 'claude-code', model: 'opus' },
      review: { backend: 'codex' },
    })
  })

  test('the retired ios modes read as off', () => {
    mkdirSync(join(home, '.config', 'circon'), { recursive: true })
    writeFileSync(join(home, '.config', 'circon', 'config.json'), JSON.stringify({ iosRunnerMode: 'vm' }))
    assert.equal(readConfig().iosRunnerMode, 'none')
  })
})
