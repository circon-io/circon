import { drizzle } from 'drizzle-orm/d1'
import { createApp } from '../app.ts'
import { clerkVerifier } from '../auth.ts'

/** Cloudflare Workers with D1: the default host. */

interface Env {
  DB: D1Database
  CLERK_JWKS_URL: string
  CLERK_ISSUER?: string
  CLERK_WEBHOOK_SECRET?: string
  ALLOWED_ORIGINS?: string
}

let app: ReturnType<typeof createApp> | null = null

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    app ??= createApp({
      db: drizzle(env.DB),
      verifyToken: clerkVerifier(env.CLERK_JWKS_URL, env.CLERK_ISSUER || undefined),
      clerkWebhookSecret: env.CLERK_WEBHOOK_SECRET,
      ...(env.ALLOWED_ORIGINS ? { allowedOrigins: env.ALLOWED_ORIGINS.split(',') } : {}),
    })
    return app.fetch(request, env, ctx)
  },
}
