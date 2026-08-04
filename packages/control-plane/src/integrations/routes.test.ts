import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { slugFor } from './routes.ts'

/**
 * The slug is a filesystem path on the runner and is split back into owner and
 * repo to mint a clone token, so both directions have to hold.
 */
describe('project slugs', () => {
  test('owner/repo becomes owner__repo', () => {
    assert.equal(slugFor('circon-io/circon'), 'circon-io__circon')
  })

  test('a single underscore is fine — it is legal in a repo name', () => {
    assert.equal(slugFor('acme/weblens_platform'), 'acme__weblens_platform')
    assert.deepEqual(slugFor('acme/weblens_platform')!.split('__'), ['acme', 'weblens_platform'])
  })

  test('a double underscore is refused, because it would not split back', () => {
    // 'a__b/c' and 'a/b__c' both give 'a__b__c'; splitting is then a guess.
    assert.equal(slugFor('a__b/c'), null)
    assert.equal(slugFor('a/b__c'), null)
  })

  test('path traversal cannot reach the runner as a directory name', () => {
    assert.equal(slugFor('../etc/passwd'), null)
    assert.equal(slugFor('..'), null)
    assert.equal(slugFor('owner/..'), null)
    assert.equal(slugFor('owner/a/b'), null)
    assert.equal(slugFor('owner'), null)
    assert.equal(slugFor(''), null)
  })

  test('leading punctuation is refused — a dotfile is not a project', () => {
    assert.equal(slugFor('owner/.git'), null)
    assert.equal(slugFor('-flag/repo'), null)
  })
})
