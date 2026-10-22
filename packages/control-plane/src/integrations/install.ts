import type { Env } from '../env.ts'
import { base64url } from './github.ts'

/**
 * Attributing a GitHub App installation to an org, safely.
 *
 * The callback GitHub redirects to is a public URL that anyone can call with
 * any `installation_id`. Two checks make it safe:
 *
 *  1. **`state` is signed.** It names the org that started the install, plus a
 *     nonce and an expiry, under an HMAC only this Worker can produce. Without
 *     it, anyone could attach an installation to an org of their choosing.
 *  2. **Access to the installation is proven.** With "Request user
 *     authorization (OAuth) during installation" enabled on the App, GitHub
 *     adds a `code` to the redirect. That code is exchanged for the installing
 *     user's token, and `GET /user/installations` must list the
 *     `installation_id`. Without this check, a signed `state` from your own org
 *     plus *someone else's* installation id would hand you tokens for their
 *     repositories.
 */

const STATE_TTL_MS = 30 * 60_000
const encoder = new TextEncoder()

async function stateKey(env: Env): Promise<CryptoKey> {
  if (!env.RUNNER_SECRET_PEPPER) throw new Error('RUNNER_SECRET_PEPPER is not set')
  // Domain-separated from the pepper's other use (hashing runner tokens), so a
  // value valid in one context can never be replayed in the other.
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(`circon:github-install-state:${env.RUNNER_SECRET_PEPPER}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function fromBase64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export async function signState(env: Env, org: string, now = Date.now()): Promise<string> {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(12)))
  const payload = base64url(encoder.encode(JSON.stringify({ o: org, n: nonce, e: now + STATE_TTL_MS })))
  const mac = await crypto.subtle.sign('HMAC', await stateKey(env), encoder.encode(payload))
  return `${payload}.${base64url(mac)}`
}

/** The org a valid, unexpired state was issued to, or null. */
export async function verifyState(env: Env, state: string, now = Date.now()): Promise<string | null> {
  const [payload, mac, extra] = state.split('.')
  if (!payload || !mac || extra !== undefined) return null
  let valid = false
  try {
    // `verify` compares in constant time.
    valid = await crypto.subtle.verify('HMAC', await stateKey(env), fromBase64url(mac), encoder.encode(payload))
  } catch {
    return null
  }
  if (!valid) return null
  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as { o?: unknown; e?: unknown }
    if (typeof decoded.o !== 'string' || typeof decoded.e !== 'number' || decoded.e < now) return null
    return decoded.o
  } catch {
    return null
  }
}

/**
 * Does the user who completed the install actually have access to it?
 *
 * Returns a reason string on refusal, so the dashboard can say what to fix.
 */
export async function userCanAccessInstallation(
  env: Env,
  code: string,
  installationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!env.GH_CLIENT_ID || !env.GH_CLIENT_SECRET) {
    return { ok: false, reason: 'GH_CLIENT_ID and GH_CLIENT_SECRET are not set on the API Worker.' }
  }

  const exchange = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env.GH_CLIENT_ID, client_secret: env.GH_CLIENT_SECRET, code }),
  })
  const token = ((await exchange.json().catch(() => ({}))) as { access_token?: string }).access_token
  if (!exchange.ok || !token) return { ok: false, reason: 'GitHub did not accept the authorization code.' }

  for (let page = 1; page <= 10; page++) {
    const res = await fetchImpl(`https://api.github.com/user/installations?per_page=100&page=${page}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'circon-control-plane',
      },
    })
    if (!res.ok) return { ok: false, reason: `GitHub refused to list installations (HTTP ${res.status}).` }
    const body = (await res.json()) as { installations?: Array<{ id: number }> }
    const batch = body.installations ?? []
    if (batch.some((i) => String(i.id) === installationId)) return { ok: true }
    if (batch.length < 100) break
  }
  return { ok: false, reason: 'You do not have access to that installation.' }
}
