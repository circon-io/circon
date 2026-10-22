import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker from './index.ts'

const assets = { fetch: async () => new Response('asset') }

test('the root redirects by Accept-Language and keeps the query', async () => {
  const response = await worker.fetch(
    new Request('https://circon.io/?ref=hn', { headers: { 'accept-language': 'de-DE,de;q=0.9' } }),
    { ASSETS: assets },
  )
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://circon.io/de/?ref=hn')
  assert.match(response.headers.get('vary') ?? '', /Accept-Language/)
})

test('anything else is handed to the static assets', async () => {
  const response = await worker.fetch(new Request('https://circon.io/en/'), { ASSETS: assets })
  assert.equal(await response.text(), 'asset')
})
