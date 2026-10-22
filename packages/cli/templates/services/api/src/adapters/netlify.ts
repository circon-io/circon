import { handle } from 'hono/netlify'
import { appFromEnv } from './libsql.ts'

/** Netlify Functions. */
export default handle(appFromEnv())
