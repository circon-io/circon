import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, satisfiesMinimum } from './exec.ts'
import { validateOrdering, components, componentById } from '../components/registry.ts'
import type { Component } from '../components/types.ts'

describe('version comparison', () => {
  test('orders numerically, not lexically', () => {
    // The bug that made android-9 beat android-36 in the shell version.
    assert.equal(compareVersions('9.0.0', '36.0.0'), -1)
    assert.equal(compareVersions('36.0.0', '9.0.0'), 1)
  })

  test('handles missing segments', () => {
    assert.equal(compareVersions('22', '22.0.0'), 0)
    assert.equal(compareVersions('22.12', '22.12.0'), 0)
    assert.equal(compareVersions('24', '22.12.0'), 1)
  })

  test('satisfiesMinimum matches the Node gate', () => {
    assert.equal(satisfiesMinimum('24.18.0', '22.12.0'), true)
    assert.equal(satisfiesMinimum('22.12.0', '22.12.0'), true)
    assert.equal(satisfiesMinimum('22.11.0', '22.12.0'), false)
    assert.equal(satisfiesMinimum('20.0.0', '22.12.0'), false)
  })
})

describe('component registry', () => {
  test('every declared dependency exists and comes first', () => {
    assert.doesNotThrow(() => validateOrdering())
  })

  test('component ids are unique', () => {
    const ids = components.map((c) => c.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  test('a dependency declared after its dependent is rejected', () => {
    const bad: Component[] = [
      { id: 'b', summary: '', requires: ['a'], check: async () => ({ status: 'ok' }), install: async () => {} },
      { id: 'a', summary: '', check: async () => ({ status: 'ok' }), install: async () => {} },
    ]
    assert.throws(() => validateOrdering(bad), /declared after it/)
  })

  test('an unknown dependency is rejected', () => {
    const bad: Component[] = [
      { id: 'a', summary: '', requires: ['nope'], check: async () => ({ status: 'ok' }), install: async () => {} },
    ]
    assert.throws(() => validateOrdering(bad), /unknown component/)
  })

  test('lookup by id works for a known component', () => {
    assert.equal(componentById('ollama-model')?.id, 'ollama-model')
    assert.equal(componentById('nonsense'), undefined)
  })
})
