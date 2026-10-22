import { test } from 'node:test'
import assert from 'node:assert/strict'
import { locales, pageForSlug, pages, pathFor, type PageId } from './config.ts'

test('every slug maps back to its page, in every language', () => {
  for (const id of Object.keys(pages) as PageId[]) {
    for (const locale of locales) {
      assert.equal(pageForSlug(locale, pages[id][locale]), id)
    }
  }
})

test('slugs are unique within a language', () => {
  for (const locale of locales) {
    const slugs = Object.values(pages).map((p) => p[locale])
    assert.equal(new Set(slugs).size, slugs.length)
  }
})

test('paths carry the language and the trailing slash', () => {
  assert.equal(pathFor('de'), '/de/')
  assert.equal(pathFor('de', 'imprint'), '/de/impressum/')
  assert.equal(pathFor('en', 'privacy'), '/en/privacy/')
})
