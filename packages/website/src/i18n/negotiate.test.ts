import { test } from 'node:test'
import assert from 'node:assert/strict'
import { negotiateLocale } from './negotiate.ts'

test('a German browser gets German', () => {
  assert.equal(negotiateLocale('de-DE,de;q=0.9,en;q=0.8', null), 'de')
})

test('quality beats order', () => {
  assert.equal(negotiateLocale('fr;q=0.9,en;q=0.5,de;q=0.7', null), 'de')
})

test('the first supported language wins on equal quality', () => {
  assert.equal(negotiateLocale('fr, de-AT, en', null), 'de')
})

test('q=0 means not acceptable', () => {
  assert.equal(negotiateLocale('de;q=0, en;q=0.1', null), 'en')
})

test('an unsupported or missing header falls back to English', () => {
  assert.equal(negotiateLocale('fr-FR,fr;q=0.9', null), 'en')
  assert.equal(negotiateLocale(null, null), 'en')
  assert.equal(negotiateLocale('', ''), 'en')
})

test('the switcher cookie overrides the browser', () => {
  assert.equal(negotiateLocale('de-DE', 'theme=dark; circon-locale=en'), 'en')
})

test('a cookie naming an unknown language is ignored', () => {
  assert.equal(negotiateLocale('de-DE', 'circon-locale=xx'), 'de')
})
