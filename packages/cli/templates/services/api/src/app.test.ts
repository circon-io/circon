import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createApp } from './app.ts'
import { principalFrom, type Principal } from './auth.ts'

/**
 * The whole API against an in-memory libSQL database with the real migrations:
 * the same SQLite schema D1 runs in production.
 */

const people: Record<string, Principal> = {
  'token-member': { userId: 'user_member', email: 'm@example.com', orgId: 'org_1', role: 'member' },
  'token-admin': { userId: 'user_admin', email: 'a@example.com', orgId: 'org_1', role: 'admin' },
}

const WEBHOOK_SECRET = `whsec_${Buffer.from('test-secret-for-webhooks').toString('base64')}`

let app: ReturnType<typeof createApp>

beforeEach(async () => {
  const db = drizzle(createClient({ url: ':memory:' }))
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname })
  app = createApp({ db, verifyToken: async (t) => people[t] ?? null, clerkWebhookSecret: WEBHOOK_SECRET })
})

const as = (token: string, init: RequestInit = {}) => ({
  ...init,
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
})

describe('api', () => {
  test('health needs no sign-in', async () => {
    const res = await app.request('/health')
    assert.equal(res.status, 200)
  })

  test('everything else does', async () => {
    assert.equal((await app.request('/me')).status, 401)
    assert.equal((await app.request('/me', as('forged'))).status, 401)
  })

  test('things are created, validated and kept per user', async () => {
    const created = await app.request('/things', as('token-member', { method: 'POST', body: JSON.stringify({ name: 'Milk' }) }))
    assert.equal(created.status, 201)
    const mine = (await (await app.request('/things', as('token-member'))).json()) as { data: Array<{ name: string }> }
    assert.deepEqual(mine.data.map((t) => t.name), ['Milk'])
    const theirs = (await (await app.request('/things', as('token-admin'))).json()) as { data: unknown[] }
    assert.deepEqual(theirs.data, [])

    const bad = await app.request('/things', as('token-member', { method: 'POST', body: JSON.stringify({ name: '' }) }))
    assert.equal(bad.status, 400)
    assert.equal(((await bad.json()) as { error: { code: string } }).error.code, 'invalid_input')
  })

  test('the admin routes check the role on the server', async () => {
    assert.equal((await app.request('/admin/users', as('token-member'))).status, 403)
    assert.equal((await app.request('/admin/users', as('token-admin'))).status, 200)
  })
})

async function signed(body: string, at = Math.floor(Date.now() / 1000)) {
  const id = 'msg_1'
  const key = await crypto.subtle.importKey(
    'raw',
    Buffer.from(WEBHOOK_SECRET.slice('whsec_'.length), 'base64'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${at}.${body}`))
  return { 'svix-id': id, 'svix-timestamp': String(at), 'svix-signature': `v1,${Buffer.from(mac).toString('base64')}` }
}

describe('clerk webhook', () => {
  const event = JSON.stringify({ type: 'user.created', data: { id: 'user_new', email_addresses: [{ email_address: 'n@example.com' }] } })

  test('a signed event syncs the user', async () => {
    const res = await app.request('/webhooks/clerk', { method: 'POST', body: event, headers: await signed(event) })
    assert.equal(res.status, 200)
    const users = (await (await app.request('/admin/users', as('token-admin'))).json()) as { data: Array<{ id: string }> }
    assert.ok(users.data.some((u) => u.id === 'user_new'))
  })

  test('a forged or replayed event is refused', async () => {
    const forged = { ...(await signed(event)), 'svix-signature': 'v1,AAAA' }
    assert.equal((await app.request('/webhooks/clerk', { method: 'POST', body: event, headers: forged })).status, 400)
    const old = await signed(event, Math.floor(Date.now() / 1000) - 3600)
    assert.equal((await app.request('/webhooks/clerk', { method: 'POST', body: event, headers: old })).status, 400)
  })
})

describe('clerk session tokens', () => {
  test('v2 tokens carry the org in `o`', () => {
    assert.deepEqual(principalFrom({ sub: 'u', o: { id: 'org_1', rol: 'admin' } }), {
      userId: 'u', email: null, orgId: 'org_1', role: 'admin',
    })
  })

  test('v1 tokens carry it in org_id and org_role', () => {
    assert.equal(principalFrom({ sub: 'u', org_id: 'org_1', org_role: 'org:member' })?.role, 'member')
  })

  test('no organization, no role', () => {
    assert.equal(principalFrom({ sub: 'u' })?.role, null)
  })
})
