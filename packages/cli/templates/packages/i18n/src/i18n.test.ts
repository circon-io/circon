import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { translate, negotiate, isLocale, locales } from './index.ts'
import { en } from './locales/en.ts'
import { de } from './locales/de.ts'

describe('i18n', () => {
  test('German covers every English key', () => {
    // The type system enforces this too; the test states it as a requirement
    // rather than an implementation detail.
    for (const key of Object.keys(en)) {
      assert.ok(key in de, `missing German translation: ${key}`)
      assert.notEqual((de as Record<string, string>)[key]?.trim(), '', `empty German: ${key}`)
    }
  })

  test('translates per locale', () => {
    assert.equal(translate('en', 'auth.signIn.submit'), 'Sign in')
    assert.equal(translate('de', 'auth.signIn.submit'), 'Anmelden')
  })

  test('negotiates from an Accept-Language list', () => {
    assert.equal(negotiate(['de-DE', 'en-GB']), 'de')
    assert.equal(negotiate(['fr-FR', 'en-US']), 'en')
    assert.equal(negotiate(['fr']), 'en', 'falls back to the default')
    assert.equal(negotiate([]), 'en')
  })

  test('interpolates, and leaves unknown placeholders alone', () => {
    const out = translate('en', 'error.generic')
    assert.equal(typeof out, 'string')
    assert.equal(
      translate('en', 'common.loading', { unused: 1 }),
      'Loading…',
    )
  })

  test('isLocale guards the supported set', () => {
    assert.deepEqual(locales, ['en', 'de'])
    assert.equal(isLocale('de'), true)
    assert.equal(isLocale('fr'), false)
  })
})
