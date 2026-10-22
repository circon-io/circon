import { handle } from 'hono/aws-lambda'
import { appFromEnv } from './libsql.ts'

/** AWS Lambda behind API Gateway or a function URL. */
export const handler = handle(appFromEnv())
