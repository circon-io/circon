import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient, ApiClientError } from './client.ts'

test('sends the session token and unwraps the result', async () => {
  let auth = ''
  const client = createApiClient({
    baseUrl: 'https://api.test',
    getToken: async () => 'tok',
    fetch: (async (_url: string, init?: RequestInit) => {
      auth = new Headers(init?.headers).get('authorization') ?? ''
      return Response.json({ ok: true, data: [{ id: '1', name: 'Milk', createdAt: 'now' }] })
    }) as typeof fetch,
  })
  assert.deepEqual(await client.listThings(), [{ id: '1', name: 'Milk', createdAt: 'now' }])
  assert.equal(auth, 'Bearer tok')
})

test('an API error surfaces its stable code', async () => {
  const client = createApiClient({
    baseUrl: 'https://api.test',
    getToken: async () => null,
    fetch: (async () => Response.json({ ok: false, error: { code: 'unauthenticated', message: 'Sign in' } }, { status: 401 })) as typeof fetch,
  })
  await assert.rejects(client.me(), (e: unknown) => e instanceof ApiClientError && e.code === 'unauthenticated' && e.status === 401)
})
