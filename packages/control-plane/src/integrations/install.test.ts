import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { signState, verifyState, userCanAccessInstallation } from './install.ts'
import type { Env } from '../env.ts'

const env = { RUNNER_SECRET_PEPPER: 'pepper', GH_CLIENT_ID: 'cid', GH_CLIENT_SECRET: 'secret' } as Env

describe('install state', () => {
  test('round-trips the org', async () => {
    assert.equal(await verifyState(env, await signState(env, 'org_a')), 'org_a')
  })

  test('a state naming another org cannot be forged', async () => {
    const state = await signState(env, 'org_a')
    const [, mac] = state.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ o: 'org_victim', n: 'x', e: Date.now() + 60_000 }))
      .toString('base64url')
    assert.equal(await verifyState(env, `${forgedPayload}.${mac}`), null)
  })

  test('a different pepper does not verify', async () => {
    const state = await signState(env, 'org_a')
    assert.equal(await verifyState({ ...env, RUNNER_SECRET_PEPPER: 'other' } as Env, state), null)
  })

  test('expires', async () => {
    const issued = Date.now() - 31 * 60_000
    assert.equal(await verifyState(env, await signState(env, 'org_a', issued)), null)
  })

  test('garbage is rejected, not thrown', async () => {
    for (const state of ['', 'org_a', 'a.b', 'a.b.c', '%%%.%%%']) {
      assert.equal(await verifyState(env, state), null)
    }
  })
})

function github(installations: number[], opts: { codeOk?: boolean } = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('login/oauth/access_token')) {
      return Response.json(opts.codeOk === false ? { error: 'bad_verification_code' } : { access_token: 'u' })
    }
    if (url.includes('/user/installations')) {
      return Response.json({ installations: installations.map((id) => ({ id })) })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

describe('installation access', () => {
  test('the installing user can see the installation', async () => {
    assert.deepEqual(await userCanAccessInstallation(env, 'code', '42', github([7, 42])), { ok: true })
  })

  test("someone else's installation id is refused", async () => {
    const result = await userCanAccessInstallation(env, 'code', '42', github([7]))
    assert.equal(result.ok, false)
  })

  test('a rejected code is refused', async () => {
    const result = await userCanAccessInstallation(env, 'code', '42', github([42], { codeOk: false }))
    assert.equal(result.ok, false)
  })

  test('unconfigured OAuth refuses rather than skipping the check', async () => {
    const result = await userCanAccessInstallation({ RUNNER_SECRET_PEPPER: 'p' } as Env, 'code', '42', github([42]))
    assert.equal(result.ok, false)
  })
})
