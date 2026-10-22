import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadCredentials, writeEnvFile } from './config.ts'

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
