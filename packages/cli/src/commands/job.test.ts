import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { slugToRemote, remoteToSlug, isValidSlug } from './job.ts'

describe('project slugs', () => {
  test('a slug maps to a github remote', () => {
    assert.equal(slugToRemote('circon-io__circon'), 'git@github.com:circon-io/circon.git')
  })

  test('a remote maps back to a slug, ssh or https, with or without .git', () => {
    assert.equal(remoteToSlug('git@github.com:circon-io/circon.git'), 'circon-io__circon')
    assert.equal(remoteToSlug('https://github.com/circon-io/circon.git'), 'circon-io__circon')
    assert.equal(remoteToSlug('https://github.com/circon-io/circon'), 'circon-io__circon')
  })

  test('rejects anything that is not org__repo', () => {
    for (const bad of [
      'circon', 'a__b__c', '', '__repo', 'org__',
      '../evil__repo', 'org__../evil', 'org__..', 'org__a..b', 'org/x__repo',
    ]) {
      assert.equal(isValidSlug(bad), false, `${bad} should be rejected`)
    }
  })

  test('accepts dots, dashes and single underscores, which real repos use', () => {
    assert.equal(isValidSlug('my-org__my.repo-name'), true)
    assert.equal(isValidSlug('sapkra__weblens_platform'), true)
    assert.equal(slugToRemote('my-org__my.repo-name'), 'git@github.com:my-org/my.repo-name.git')
  })

  test('a malformed slug yields no remote rather than a broken one', () => {
    assert.equal(slugToRemote('nodoubleunderscore'), null)
  })
})
