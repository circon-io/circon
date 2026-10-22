import { handle } from 'hono/vercel'
import { appFromEnv } from './libsql.ts'

/** Vercel Functions. */
export const GET = handle(appFromEnv())
export const POST = GET
export const PUT = GET
export const DELETE = GET
export const OPTIONS = GET
