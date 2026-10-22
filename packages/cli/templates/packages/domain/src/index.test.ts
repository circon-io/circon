import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ValidationError, type Thing } from '@app/shared'
import { createThing, listThings, syncUser, type ThingRepository, type UserRepository } from './index.ts'

function memoryThings(): ThingRepository & { rows: Array<Thing & { ownerId: string }> } {
  const rows: Array<Thing & { ownerId: string }> = []
  return {
    rows,
    listForOwner: async (ownerId) => rows.filter((r) => r.ownerId === ownerId).map(({ ownerId: _o, ...t }) => t),
    insert: async (thing) => {
      rows.push(thing)
    },
  }
}

test('a thing is validated, trimmed and owned', async () => {
  const repo = memoryThings()
  const thing = await createThing(repo, 'user_1', { name: '  Milk ' })
  assert.equal(thing.name, 'Milk')
  assert.deepEqual(await listThings(repo, 'user_1'), [thing])
  assert.deepEqual(await listThings(repo, 'user_2'), [])
})

test('an empty name is refused before anything is stored', async () => {
  const repo = memoryThings()
  await assert.rejects(createThing(repo, 'user_1', { name: '   ' }), ValidationError)
  assert.equal(repo.rows.length, 0)
})

test('user events from Clerk keep the local copy in step', async () => {
  const calls: string[] = []
  const repo: UserRepository = {
    upsert: async (u) => { calls.push(`upsert ${u.id} ${u.email}`) },
    remove: async (id) => { calls.push(`remove ${id}`) },
    list: async () => [],
  }
  await syncUser(repo, { type: 'user.created', data: { id: 'u1', email_addresses: [{ email_address: 'a@b.c' }] } })
  await syncUser(repo, { type: 'user.deleted', data: { id: 'u1' } })
  assert.equal(await syncUser(repo, { type: 'session.created', data: { id: 's' } }), 'ignored')
  assert.deepEqual(calls, ['upsert u1 a@b.c', 'remove u1'])
})
