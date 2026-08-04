import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { base64url, pemToDer, appJwt, verifyWebhook } from './github.ts'

/**
 * The crypto is the part worth testing: a wrong signature is not a visible bug,
 * it is a 401 from GitHub with no explanation.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

// PKCS#1 is what GitHub actually hands out, so the detection path needs a sample.
const { privateKey: pkcs1Key } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
})

describe('base64url', () => {
  test('strips padding and uses the URL alphabet', () => {
    const encoded = base64url(new TextEncoder().encode('sure?'))
    assert.ok(!encoded.includes('='), 'no padding')
    assert.ok(!encoded.includes('+') && !encoded.includes('/'), 'URL-safe alphabet')
  })

  test('round-trips through atob', () => {
    const input = 'a'.repeat(100)
    const encoded = base64url(new TextEncoder().encode(input))
    const restored = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
    assert.equal(restored, input)
  })
})

describe('PEM parsing', () => {
  test('reads a PKCS#8 key', () => {
    const { format, der } = pemToDer(privateKey)
    assert.equal(format, 'pkcs8')
    assert.ok(der.length > 100)
  })

  test('detects PKCS#1 rather than failing opaquely later', () => {
    assert.equal(pemToDer(pkcs1Key).format, 'pkcs1')
  })

  test('tolerates a key pasted with literal \\n, as GitHub secrets often are', () => {
    const escaped = privateKey.replace(/\n/g, '\\n')
    assert.equal(pemToDer(escaped).format, 'pkcs8')
    assert.deepEqual(pemToDer(escaped).der, pemToDer(privateKey).der)
  })
})

describe('app JWT', () => {
  const env = { GH_APP_ID: '12345', GH_APP_PRIVATE_KEY: privateKey } as never

  test('produces three base64url segments', async () => {
    const jwt = await appJwt(env)
    const parts = jwt.split('.')
    assert.equal(parts.length, 3)
    for (const part of parts) assert.doesNotMatch(part, /[+/=]/)
  })

  test('claims are what GitHub requires', async () => {
    const [, payload] = (await appJwt(env)).split('.')
    const claims = JSON.parse(
      Buffer.from(payload!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    ) as { iat: number; exp: number; iss: string }

    assert.equal(claims.iss, '12345')
    const now = Math.floor(Date.now() / 1000)
    // Backdated, because GitHub rejects a future iat and clocks drift.
    assert.ok(claims.iat <= now, 'iat must not be in the future')
    assert.ok(claims.exp > now, 'exp must be in the future')
    assert.ok(claims.exp - claims.iat <= 600, 'GitHub caps app JWTs at 10 minutes')
  })

  test('the signature verifies against the public key', async () => {
    const jwt = await appJwt(env)
    const [header, payload, signature] = jwt.split('.')

    const key = await crypto.subtle.importKey(
      'spki',
      pemToDer(publicKey).der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const sig = Buffer.from(signature!.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      sig,
      new TextEncoder().encode(`${header}.${payload}`),
    )
    assert.equal(valid, true, 'GitHub would reject an unverifiable JWT with a bare 401')
  })

  test('a PKCS#1 key fails with an actionable message', async () => {
    await assert.rejects(
      () => appJwt({ GH_APP_ID: '1', GH_APP_PRIVATE_KEY: pkcs1Key } as never),
      /PKCS#1.*openssl pkcs8/s,
    )
  })

  test('missing configuration is named', async () => {
    await assert.rejects(() => appJwt({} as never), /GH_APP_ID/)
    await assert.rejects(
      () => appJwt({ GH_APP_ID: '1' } as never),
      /GH_APP_PRIVATE_KEY/,
    )
  })
})

describe('webhook signatures', () => {
  const secret = 'a-webhook-secret'
  const body = JSON.stringify({ action: 'created', installation: { id: 42 } })

  async function sign(s: string, b: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(s),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(b))
    return `sha256=${[...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, '0')).join('')}`
  }

  test('accepts a correct signature', async () => {
    assert.equal(await verifyWebhook(secret, body, await sign(secret, body)), true)
  })

  test('rejects a tampered body', async () => {
    const signature = await sign(secret, body)
    const tampered = JSON.stringify({ action: 'created', installation: { id: 999 } })
    assert.equal(await verifyWebhook(secret, tampered, signature), false)
  })

  test('rejects the wrong secret', async () => {
    assert.equal(await verifyWebhook('other-secret', body, await sign(secret, body)), false)
  })

  test('rejects a missing or malformed header', async () => {
    assert.equal(await verifyWebhook(secret, body, null), false)
    assert.equal(await verifyWebhook(secret, body, 'deadbeef'), false)
    assert.equal(await verifyWebhook(secret, body, 'sha1=deadbeef'), false)
    assert.equal(await verifyWebhook(secret, body, 'sha256='), false)
  })
})
