import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { err, ok, ValidationError } from '@app/shared'
import { createThing, listThings, syncUser } from '@app/domain'
import { requireAuth, requireRole, type AuthEnv, type VerifyToken } from './auth.ts'
import { thingRepository, userRepository, type Database } from './db/repositories.ts'
import { verifySvix } from './webhooks.ts'

/**
 * The API, independent of where it runs.
 *
 * Every host (Cloudflare, Node, Lambda, Vercel, Netlify) has an adapter in
 * src/adapters/ that builds the database and calls `createApp`. Nothing in here
 * may touch a host-specific API — that is what keeps a move to another host a
 * new adapter file rather than a rewrite.
 */

export interface AppDeps {
  db: Database
  verifyToken: VerifyToken
  /** Clerk's webhook signing secret (`whsec_…`); the webhook is refused without it. */
  clerkWebhookSecret?: string | undefined
  /** Browser origins allowed to call the API. Native apps send no Origin header. */
  allowedOrigins?: string[]
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AuthEnv>()
  const things = thingRepository(deps.db)
  const users = userRepository(deps.db)
  const auth = requireAuth(deps.verifyToken)

  app.use('*', cors({ origin: deps.allowedOrigins ?? ['http://localhost:8081'], allowHeaders: ['authorization', 'content-type'] }))

  app.onError((error, c) => {
    if (error instanceof ValidationError) {
      return c.json(err('invalid_input', error.message, { field: error.field }), 400)
    }
    // Never leak an internal message to a client.
    console.error(error)
    return c.json(err('internal', 'Something went wrong.'), 500)
  })

  // Unauthenticated and cheap; rate-limit it in front of the API, not here.
  app.get('/health', (c) => c.json(ok({ status: 'up' })))

  app.get('/me', auth, (c) => {
    const p = c.get('principal')
    return c.json(ok({ id: p.userId, email: p.email, orgId: p.orgId, role: p.role }))
  })

  app.get('/things', auth, async (c) => c.json(ok(await listThings(things, c.get('principal').userId))))

  app.post('/things', auth, async (c) => {
    const body: unknown = await c.req.json().catch(() => {
      throw new ValidationError('body', 'must be JSON')
    })
    return c.json(ok(await createThing(things, c.get('principal').userId, body)), 201)
  })

  // The admin area of the app is a UI over these routes; the role check is here.
  app.get('/admin/users', auth, requireRole('admin'), async (c) => c.json(ok(await users.list(100))))

  app.post('/webhooks/clerk', async (c) => {
    if (!deps.clerkWebhookSecret) return c.json(err('not_configured', 'CLERK_WEBHOOK_SECRET is not set.'), 503)
    const body = await c.req.text()
    const valid = await verifySvix(
      deps.clerkWebhookSecret,
      { id: c.req.header('svix-id'), timestamp: c.req.header('svix-timestamp'), signature: c.req.header('svix-signature') },
      body,
    )
    if (!valid) return c.json(err('bad_signature', 'Signature verification failed.'), 400)
    const event = JSON.parse(body) as Parameters<typeof syncUser>[1]
    return c.json(ok({ result: await syncUser(users, event) }))
  })

  app.notFound((c) => c.json(err('not_found', `No route for ${c.req.method} ${c.req.path}.`), 404))
  return app
}
