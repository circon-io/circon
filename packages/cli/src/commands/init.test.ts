import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scaffold, bundleIdFor, safeName } from './init.ts'

let root = ''
let templates = ''
let target = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'circon-init-'))
  templates = join(root, 'templates')
  target = join(root, 'project')
  mkdirSync(join(templates, '.circon', 'flows'), { recursive: true })
  mkdirSync(target)
  writeFileSync(join(templates, 'package.json'), '{"name":"monorepo","private":true}')
  writeFileSync(join(templates, 'gitignore'), 'node_modules\n.env\n')
  writeFileSync(join(templates, 'app.json'), '{"bundle":"__BUNDLE_ID__","name":"__PROJECT_NAME__"}')
  writeFileSync(join(templates, 'README.md'), 'template readme')
  writeFileSync(join(templates, '.circon', 'flows', 'web.sh'), '#!/bin/bash\n')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('scaffolding', () => {
  test('fills tokens, restores the gitignore, makes flows executable', () => {
    scaffold(target, { name: 'shop', bundleId: 'com.acme.shop' }, templates)
    assert.equal(readFileSync(join(target, 'app.json'), 'utf8'), '{"bundle":"com.acme.shop","name":"shop"}')
    assert.ok(existsSync(join(target, '.gitignore')))
    assert.ok(!existsSync(join(target, 'gitignore')))
    assert.ok(statSync(join(target, '.circon', 'flows', 'web.sh')).mode & 0o100)
    assert.equal(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name, 'shop')
  })

  test('never overwrites what the repository already has', () => {
    writeFileSync(join(target, 'README.md'), 'our readme')
    writeFileSync(join(target, 'PRD.md'), '# The approved plan')
    writeFileSync(join(target, 'package.json'), '{"name":"theirs"}')
    const written = scaffold(target, { name: 'shop', bundleId: 'com.acme.shop' }, templates)
    assert.equal(readFileSync(join(target, 'README.md'), 'utf8'), 'our readme')
    assert.equal(readFileSync(join(target, 'PRD.md'), 'utf8'), '# The approved plan')
    assert.equal(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name, 'theirs')
    assert.ok(!written.includes('README.md'))
  })

  test("an existing .gitignore gains only the template's missing lines", () => {
    writeFileSync(join(target, '.gitignore'), 'node_modules\ndist\n')
    scaffold(target, { name: 'shop', bundleId: 'com.acme.shop' }, templates)
    const text = readFileSync(join(target, '.gitignore'), 'utf8')
    assert.match(text, /^node_modules\ndist\n/)
    assert.match(text, /\.env/)
    assert.equal(text.match(/node_modules/g)?.length, 1)
  })
})

describe('names', () => {
  test('store identifiers are letters and digits per segment', () => {
    assert.equal(bundleIdFor('circon-io', 'weblens_platform'), 'com.circonio.weblensplatform')
    assert.equal(bundleIdFor('3d-labs', 'app'), 'com.app3dlabs.app')
  })

  test('project names are npm and Worker safe', () => {
    assert.equal(safeName('Weblens_Platform'), 'weblens-platform')
    assert.equal(safeName('___'), 'app')
  })
})
