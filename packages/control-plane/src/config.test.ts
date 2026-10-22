import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeConfig, mergeConfigs, parseStoredConfig } from './config.ts'

describe('sanitizing config', () => {
  test('keeps valid settings', () => {
    const { config, errors } = sanitizeConfig({
      budgetPerRunUsd: 5,
      verifyEvery: 3,
      iosRunnerMode: 'simulator',
      skipTiers: ['android UI'],
      agents: { build: { backend: 'claude-code', model: 'opus' }, plan: null },
    })
    assert.deepEqual(errors, [])
    assert.deepEqual(config, {
      budgetPerRunUsd: 5,
      verifyEvery: 3,
      iosRunnerMode: 'simulator',
      skipTiers: ['android UI'],
      agents: { build: { backend: 'claude-code', model: 'opus' }, plan: null },
    })
  })

  test('names every rejected field instead of failing vaguely', () => {
    const { config, errors } = sanitizeConfig({
      budgetPerRunUsd: -1,
      verifyEvery: 2.5,
      iosRunnerMode: 'vm',
      skipTiers: ['everything'],
      shell: 'rm -rf /',
    })
    assert.deepEqual(config, {})
    assert.equal(errors.length, 5)
    assert.ok(errors.some((e) => e.startsWith('shell')))
  })

  test('an unknown backend or a hostile model name is refused', () => {
    const { errors } = sanitizeConfig({
      agents: { build: { backend: 'gpt-shell' }, review: { backend: 'codex', model: '$(curl x)' } },
    })
    assert.equal(errors.length, 2)
  })

  test('only the planning step can be switched off', () => {
    const { config, errors } = sanitizeConfig({ agents: { build: null, plan: null } })
    assert.deepEqual(config, { agents: { plan: null } })
    assert.equal(errors.length, 1)
  })
})

describe('layering', () => {
  test('a later layer overrides only what it sets', () => {
    const org = { budgetPerRunUsd: 10, budgetPerDayUsd: 40 }
    const runner = { iosRunnerMode: 'device' as const }
    const project = { budgetPerRunUsd: 2 }
    assert.deepEqual(mergeConfigs(org, runner, project), {
      budgetPerRunUsd: 2,
      budgetPerDayUsd: 40,
      iosRunnerMode: 'device',
    })
  })

  test('agents merge per role', () => {
    const org = { agents: { build: { backend: 'aider' as const }, review: { backend: 'codex' as const } } }
    const project = { agents: { build: { backend: 'claude-code' as const, model: 'opus' } } }
    assert.deepEqual(mergeConfigs(org, project).agents, {
      build: { backend: 'claude-code', model: 'opus' },
      review: { backend: 'codex' },
    })
  })

  test('a stored row that no longer validates degrades to nothing, not a crash', () => {
    assert.deepEqual(parseStoredConfig('{not json'), {})
    assert.deepEqual(parseStoredConfig('{"iosRunnerMode":"vm","verifyEvery":4}'), { verifyEvery: 4 })
  })
})
