import { serve } from '@hono/node-server'
import { appFromEnv } from './libsql.ts'

/** A plain Node server: Google Cloud Run, Fly, a container, a VM. */
const port = Number(process.env['PORT'] ?? 8787)
serve({ fetch: appFromEnv().fetch, port })
console.log(`API listening on :${port}`)
