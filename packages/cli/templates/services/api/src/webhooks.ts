/**
 * Verifying Clerk's webhooks, which are signed with Svix.
 *
 * Unauthenticated by necessity, so the signature is the authentication: the
 * body is not trusted until it verifies, and an old timestamp is refused so a
 * captured request cannot be replayed later.
 */

const TOLERANCE_SECONDS = 5 * 60

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function encodeBase64(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifySvix(
  secret: string,
  headers: { id?: string | undefined; timestamp?: string | undefined; signature?: string | undefined },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false
  const sent = Number(headers.timestamp)
  if (!Number.isFinite(sent) || Math.abs(now / 1000 - sent) > TOLERANCE_SECONDS) return false

  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase64(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`))
  const expected = encodeBase64(mac)
  // The header may carry several signatures during key rotation: "v1,abc v1,def".
  return headers.signature
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((candidate) => constantTimeEqual(candidate, expected))
}
