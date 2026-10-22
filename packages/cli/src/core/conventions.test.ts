import { test, describe, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { resolve, currentRef } from './conventions.ts'

let home = ''
let origin = ''
const previousHome = process.env['CIRCON_HOME']

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    encoding: 'utf8',
  })
}

function commitArchitecture(requires: string | null, tag?: string) {
  writeFileSync(
    join(origin, 'ARCHITECTURE.md'),
    `# Conventions\n${requires ? `requires-cli: >=${requires}\n` : ''}${Math.random()}\n`,
  )
  git(origin, 'add', '-A')
  git(origin, 'commit', '-qm', 'conventions')
  if (tag) git(origin, 'tag', tag)
}

function cloneIntoHome() {
  const target = join(home, 'AI-Workspace', 'conventions')
  mkdirSync(join(home, 'AI-Workspace'), { recursive: true })
  execFileSync('git', ['clone', '-q', origin, target])
  return target
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'circon-conv-'))
  origin = join(home, 'origin')
  mkdirSync(origin)
  execFileSync('git', ['init', '-q', '-b', 'main', origin])
  process.env['CIRCON_HOME'] = home
})

after(() => {
  if (previousHome === undefined) delete process.env['CIRCON_HOME']
  else process.env['CIRCON_HOME'] = previousHome
  if (home) rmSync(home, { recursive: true, force: true })
})

describe('resolving conventions', () => {
  test('picks the newest tag this CLI satisfies', async () => {
    commitArchitecture('0.1.0', 'v1.0.0')
    commitArchitecture('9.0.0', 'v2.0.0')
    cloneIntoHome()
    const r = await resolve('0.2.0')
    assert.equal(r.ref, 'v1.0.0')
    assert.equal(await currentRef(), 'v1.0.0')
  })

  test('resolving again from a pinned, detached clone still works', async () => {
    // The old update pulled first, which fails on a detached HEAD, so every
    // update after the first one broke.
    commitArchitecture('0.1.0', 'v1.0.0')
    cloneIntoHome()
    assert.equal((await resolve('0.2.0')).ref, 'v1.0.0')

    commitArchitecture('0.2.0', 'v1.1.0')
    const again = await resolve('0.2.0')
    assert.equal(again.ref, 'v1.1.0')
    assert.equal(again.warning, undefined)
  })

  test('an untagged repository follows its branch', async () => {
    commitArchitecture(null)
    const clone = cloneIntoHome()
    commitArchitecture(null)
    const head = git(origin, 'rev-parse', '--short', 'HEAD').trim()

    const r = await resolve('0.2.0')
    assert.equal(r.ref, null)
    assert.equal(git(clone, 'rev-parse', '--short', 'HEAD').trim(), head)
  })

  test('warns, and keeps working, when no tag is satisfiable', async () => {
    commitArchitecture('9.0.0', 'v3.0.0')
    cloneIntoHome()
    const r = await resolve('0.2.0')
    assert.equal(r.ref, null)
    assert.match(r.warning ?? '', /\(v3\.0\.0\) needs >=9\.0\.0/)
  })
})
