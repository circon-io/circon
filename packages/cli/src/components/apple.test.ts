import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  appImageArch, appleKey, webDriverAgentUrl, xtoolDownloadUrl, xtoolLauncherScript, xtoolLoginInput,
} from './apple.ts'
import { components } from './registry.ts'
import { PINNED } from '../core/spec.ts'

describe('xtool on a Linux runner', () => {
  test('only Linux installs it, after usbmuxd and before WebDriverAgent', () => {
    const ids = components.map((c) => c.id)
    for (const id of ['xtool', 'webdriveragent']) {
      assert.deepEqual(components.find((c) => c.id === id)?.platforms, ['linux'])
    }
    assert.ok(ids.indexOf('ios-device') < ids.indexOf('xtool'))
    assert.ok(ids.indexOf('xtool') < ids.indexOf('webdriveragent'))
  })

  test('the AppImage matches the machine, and nothing else gets one', () => {
    assert.equal(appImageArch('x64'), 'x86_64')
    assert.equal(appImageArch('arm64'), 'aarch64')
    assert.equal(appImageArch('ia32'), null)
  })

  test('downloads are the pinned releases', () => {
    assert.equal(
      xtoolDownloadUrl(PINNED.xtool, 'x86_64'),
      `https://github.com/xtool-org/xtool/releases/download/${PINNED.xtool}/xtool-x86_64.AppImage`,
    )
    assert.match(webDriverAgentUrl('16.15.3'), /\/download\/v16\.15\.3\/WebDriverAgentRunner-Runner\.zip$/)
  })

  test('the launcher runs the extracted AppImage, so no FUSE is needed', () => {
    const script = xtoolLauncherScript('/home/r/.local/share/circon/xtool')
    assert.ok(script.startsWith('#!/bin/sh\n'))
    assert.match(script, /exec "\/home\/r\/\.local\/share\/circon\/xtool\/AppRun" "\$@"/)
  })

  test('the key login answers its three prompts in order', () => {
    assert.equal(xtoolLoginInput({ keyId: 'K1', issuerId: 'I-2', keyPath: '/k.p8' }), 'K1\nI-2\n/k.p8\n')
  })

  test('a key counts only when all three parts are set', () => {
    const full = { APPLE_ASC_KEY_ID: 'K1', APPLE_ASC_ISSUER_ID: 'I-2', APPLE_ASC_KEY_PATH: '/k.p8' }
    assert.deepEqual(appleKey(full), { keyId: 'K1', issuerId: 'I-2', keyPath: '/k.p8' })
    assert.equal(appleKey({ ...full, APPLE_ASC_KEY_PATH: '' }), null)
    assert.equal(appleKey({}), null)
  })
})
