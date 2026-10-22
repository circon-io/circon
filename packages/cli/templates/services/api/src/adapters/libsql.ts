import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { createApp } from '../app.ts'
import { clerkVerifier } from '../auth.ts'

/**
 * The app for every non-Cloudflare host, on libSQL (Turso, or a local file):
 * the same SQLite schema as D1, reached over the network.
 */
export function appFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const client = createClient({
    url: env['DATABASE_URL'] ?? 'file:local.db',
    ...(env['DATABASE_AUTH_TOKEN'] ? { authToken: env['DATABASE_AUTH_TOKEN'] } : {}),
  })
  return createApp({
    db: drizzle(client),
    verifyToken: clerkVerifier(env['CLERK_JWKS_URL'] ?? '', env['CLERK_ISSUER'] || undefined),
    clerkWebhookSecret: env['CLERK_WEBHOOK_SECRET'],
    ...(env['ALLOWED_ORIGINS'] ? { allowedOrigins: env['ALLOWED_ORIGINS'].split(',') } : {}),
  })
}
