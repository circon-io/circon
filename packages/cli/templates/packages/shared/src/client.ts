import type { ApiResult } from './index.ts'
import type { AdminUser, CreateThing, Me, Thing } from './contract.ts'

/**
 * A typed client for `services/api`, used by every app.
 *
 * Framework-free on purpose: React apps wrap it in a hook that supplies the
 * Clerk token, a script can use it with a static one.
 */

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
    this.name = 'ApiClientError'
  }
}

export interface ApiClientOptions {
  baseUrl: string
  /** Returns the current session token, or null when signed out. */
  getToken: () => Promise<string | null>
  fetch?: typeof fetch
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetch ?? fetch

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await opts.getToken()
    const res = await doFetch(`${opts.baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const result = (await res.json().catch(() => null)) as ApiResult<T> | null
    if (!result) throw new ApiClientError('bad_response', `The API answered ${res.status} with no body.`, res.status)
    if (!result.ok) throw new ApiClientError(result.error.code, result.error.message, res.status)
    return result.data
  }

  return {
    me: () => call<Me>('GET', '/me'),
    listThings: () => call<Thing[]>('GET', '/things'),
    createThing: (input: CreateThing) => call<Thing>('POST', '/things', input),
    adminUsers: () => call<AdminUser[]>('GET', '/admin/users'),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
