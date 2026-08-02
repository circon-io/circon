import { type ApiResult, err, ok, object, str, ValidationError } from '@app/shared'

/**
 * The API worker.
 *
 * Every route validates its input before any logic runs, returns one error
 * shape, and uses the status code that reflects reality. Authorization happens
 * here on the server — a hidden button is not access control.
 */

interface Env {
  CLERK_SECRET_KEY?: string
}

function json(body: ApiResult<unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

const createThing = object({ name: str('name', { min: 2, max: 120 }) })

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Unauthenticated and cheap, so it must be rate-limited in front of the
    // Worker (Cloudflare rules) rather than here.
    if (url.pathname === '/health') {
      return json(ok({ status: 'up' }), 200)
    }

    if (url.pathname === '/things' && request.method === 'POST') {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return json(err('invalid_json', 'The request body is not valid JSON.'), 400)
      }

      try {
        const input = createThing(body)
        return json(ok({ id: crypto.randomUUID(), name: input.name }), 201)
      } catch (e) {
        if (e instanceof ValidationError) {
          return json(err('invalid_input', e.message, { field: e.field }), 400)
        }
        // Never leak an internal message to a client.
        console.error(e)
        return json(err('internal', 'Something went wrong.'), 500)
      }
    }

    return json(err('not_found', `No route for ${request.method} ${url.pathname}.`), 404)
  },
}
