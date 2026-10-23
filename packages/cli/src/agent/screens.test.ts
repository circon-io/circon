import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoverRoutes, shotName } from './screens.ts'
import { parseFindings } from './findings.ts'

const TEMPLATE = new URL('../../templates', import.meta.url).pathname

test("the template's public routes: no route groups, no layouts, one entry per platform variant", () => {
  assert.deepEqual(discoverRoutes(TEMPLATE), ['/', '/sign-in'])
})

test('nested folders become paths; dynamic segments and special files are skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'circon-screens-'))
  try {
    const app = join(dir, 'apps/mobile/app')
    for (const f of ['index.tsx', '+not-found.tsx', 'settings/index.tsx', 'settings/profile.tsx', 'lists/[id].tsx', '(app)/home.tsx']) {
      mkdirSync(join(app, f, '..'), { recursive: true })
      writeFileSync(join(app, f), '')
    }
    assert.deepEqual(discoverRoutes(dir), ['/', '/settings', '/settings/profile'])
    mkdirSync(join(dir, '.circon'), { recursive: true })
    writeFileSync(join(dir, '.circon/screens.txt'), '# the screens worth reviewing\n/\nlists/demo\n')
    assert.deepEqual(discoverRoutes(dir), ['/', '/lists/demo'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('screenshot names match what screens.sh writes', () => {
  assert.equal(shotName('/'), 'home.png')
  assert.equal(shotName('/settings/profile'), 'settings-profile.png')
})

test('findings: one per bullet, CLEAN means none', () => {
  assert.deepEqual(parseFindings('Here is what I found:\n- a.ts: x -> y\n* b.ts: z -> w\n'), ['a.ts: x -> y', 'b.ts: z -> w'])
  assert.deepEqual(parseFindings('CLEAN'), [])
})
