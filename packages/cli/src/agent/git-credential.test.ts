import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseRequest, pathToSlug, slugToHttps, credentialFlags } from './git-credential.ts'

/**
 * A helper that answers the wrong request hands a token for one repository to a
 * process asking about another. Nothing visible goes wrong — so this is tested
 * rather than reasoned about.
 */

describe('parsing git\'s credential request', () => {
  test('reads the keys git sends', () => {
    const request = parseRequest('protocol=https\nhost=github.com\npath=acme/app.git\n\n')
    assert.deepEqual(request, { protocol: 'https', host: 'github.com', path: 'acme/app.git' })
  })

  test('ignores keys we do not act on', () => {
    // git also sends username, wwwauth[] and capability[] lines.
    const request = parseRequest('protocol=https\nhost=github.com\nusername=someone\ncapability[]=authtype\n')
    assert.equal(request.protocol, 'https')
    assert.ok(!('username' in request))
  })

  test('a value containing = survives', () => {
    assert.equal(parseRequest('path=a/b=c').path, 'a/b=c')
  })

  test('malformed lines are skipped, not fatal', () => {
    const request = parseRequest('\ngarbage\n=novalue\nhost=github.com\n')
    assert.equal(request.host, 'github.com')
    assert.equal(request.path, undefined)
  })
})

describe('path to slug', () => {
  test('with and without the .git suffix', () => {
    assert.equal(pathToSlug('acme/app.git'), 'acme__app')
    assert.equal(pathToSlug('acme/app'), 'acme__app')
    assert.equal(pathToSlug('/acme/app.git'), 'acme__app')
  })

  test('a single underscore is preserved', () => {
    assert.equal(pathToSlug('acme/weblens_platform'), 'acme__weblens_platform')
  })

  test('refuses anything that is not exactly owner/repo', () => {
    // Answering these would mean guessing which repository was meant.
    assert.equal(pathToSlug('acme'), null)
    assert.equal(pathToSlug('acme/app/extra'), null)
    assert.equal(pathToSlug(''), null)
    assert.equal(pathToSlug(undefined), null)
  })

  test('refuses a double underscore, matching the control plane', () => {
    // The control plane will not create such a project, so a token could not be
    // minted for one anyway — declining here keeps the two halves consistent.
    assert.equal(pathToSlug('a__b/c'), null)
  })

  test('refuses traversal', () => {
    assert.equal(pathToSlug('../etc'), null)
    assert.equal(pathToSlug('acme/..'), null)
  })

  test('round-trips with slugToHttps', () => {
    const url = slugToHttps('acme__app')
    assert.equal(url, 'https://github.com/acme/app.git')
    assert.equal(pathToSlug(new URL(url!).pathname), 'acme__app')
  })
})

describe('credential flags', () => {
  test('resets inherited helpers before adding ours', async () => {
    const flags = await credentialFlags()
    const helpers = flags.filter((_, i) => flags[i - 1] === '-c' && flags[i]!.startsWith('credential.helper'))
    // An empty value first: a global keychain helper must not answer ahead of us
    // with a stale personal credential.
    assert.equal(helpers[0], 'credential.helper=')
    assert.match(helpers[1]!, /^credential\.helper=!/)
  })

  test('asks git for the path, without which the repo is unknowable', async () => {
    assert.ok((await credentialFlags()).includes('credential.useHttpPath=true'))
  })
})
