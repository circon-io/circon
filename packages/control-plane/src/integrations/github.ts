import type { Env } from '../env.ts'

/**
 * GitHub App integration.
 *
 * A GitHub App rather than OAuth or a PAT: grants are per-repository, tokens are
 * short-lived and installation-scoped, and revoking access is uninstalling. It
 * also replaces two hacks — pre-authorized SSH keys on the runner, and `gh auth`
 * for opening pull requests.
 *
 * Two credentials are in play and they are easy to confuse:
 *
 *   app JWT            signed with the App's private key, identifies the *App*.
 *                      Valid 10 minutes, used only to mint the next one.
 *   installation token identifies the App *on one account*. Valid 1 hour, this
 *                      is what clones repositories and opens PRs.
 */

const API = 'https://api.github.com'
const UA = 'circon-control-plane'

// --- encoding ---------------------------------------------------------------

export function base64url(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * PEM to raw DER.
 *
 * GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"); WebCrypto only imports
 * PKCS#8 ("BEGIN PRIVATE KEY"). Detecting that here turns an inscrutable
 * `importKey` failure into an actionable message, because converting the key is
 * a one-line openssl command the operator has to run.
 */
export function pemToDer(pem: string): { der: Uint8Array; format: 'pkcs8' | 'pkcs1' } {
  const normalized = pem.replace(/\\n/g, '\n').trim()
  const isPkcs1 = /BEGIN RSA PRIVATE KEY/.test(normalized)

  const body = normalized
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '')

  const binary = atob(body)
  const der = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i)

  return { der, format: isPkcs1 ? 'pkcs1' : 'pkcs8' }
}

// --- app JWT ----------------------------------------------------------------

async function signingKey(pem: string): Promise<CryptoKey> {
  const { der, format } = pemToDer(pem)
  if (format === 'pkcs1') {
    throw new Error(
      'GH_APP_PRIVATE_KEY is in PKCS#1 format, which WebCrypto cannot import. ' +
        'Convert it once with: openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in key.pem',
    )
  }
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/**
 * A short-lived JWT proving we are the App.
 *
 * `iat` is backdated 60 seconds because GitHub rejects tokens whose `iat` is in
 * the future, and a Worker's clock can be marginally ahead of theirs.
 */
export async function appJwt(env: Env): Promise<string> {
  if (!env.GH_APP_ID) throw new Error('GH_APP_ID is not set')
  if (!env.GH_APP_PRIVATE_KEY) throw new Error('GH_APP_PRIVATE_KEY is not set')

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = base64url(
    new TextEncoder().encode(
      JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GH_APP_ID }),
    ),
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await signingKey(env.GH_APP_PRIVATE_KEY),
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${base64url(signature)}`
}

// --- installation tokens ----------------------------------------------------

export interface InstallationToken {
  token: string
  expiresAt: string
}

/**
 * An installation token, optionally narrowed to specific repositories.
 *
 * Narrowing matters: a runner cloning one project should not hold a credential
 * for every repository the installation can see.
 */
export async function installationToken(
  env: Env,
  installationId: string,
  repositories?: string[],
): Promise<InstallationToken> {
  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await appJwt(env)}`,
      accept: 'application/vnd.github+json',
      'user-agent': UA,
      'content-type': 'application/json',
    },
    ...(repositories?.length ? { body: JSON.stringify({ repositories }) } : {}),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`could not mint an installation token (HTTP ${res.status}) ${detail.slice(0, 200)}`)
  }

  const body = (await res.json()) as { token: string; expires_at: string }
  return { token: body.token, expiresAt: body.expires_at }
}

export interface GithubRepo {
  id: string
  fullName: string
  defaultBranch: string
  private: boolean
}

/** Repositories this installation can see. Paginated; 100 is plenty here. */
export async function listRepositories(
  env: Env,
  installationId: string,
): Promise<GithubRepo[]> {
  const { token } = await installationToken(env, installationId)
  const out: GithubRepo[] = []

  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${API}/installation/repositories?per_page=100&page=${page}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': UA,
      },
    })
    if (!res.ok) break

    const body = (await res.json()) as {
      repositories?: Array<{
        id: number
        full_name: string
        default_branch: string
        private: boolean
      }>
    }
    const batch = body.repositories ?? []
    for (const repo of batch) {
      out.push({
        id: String(repo.id),
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || 'main',
        private: repo.private,
      })
    }
    if (batch.length < 100) break
  }
  return out
}

/** Open a pull request as the App, replacing the runner's `gh` dependency. */
export async function createPullRequest(
  env: Env,
  installationId: string,
  fullName: string,
  input: { title: string; body: string; head: string; base: string },
): Promise<string | null> {
  const { token } = await installationToken(env, installationId, [fullName.split('/')[1] ?? ''])
  const res = await fetch(`${API}/repos/${fullName}/pulls`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': UA,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) return null
  const body = (await res.json()) as { html_url?: string }
  return body.html_url ?? null
}

// --- webhooks ---------------------------------------------------------------

/**
 * Verify `X-Hub-Signature-256`: HMAC-SHA256 of the raw body, hex, `sha256=`
 * prefixed. Compared in constant time — a fast-exit comparison on a MAC leaks
 * enough to forge one.
 */
export async function verifyWebhook(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const provided = signatureHeader.slice('sha256='.length)
  if (provided.length !== expected.length) return false

  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return diff === 0
}

export function installUrl(env: Env, state: string): string {
  const slug = env.GH_APP_SLUG ?? ''
  return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`
}
