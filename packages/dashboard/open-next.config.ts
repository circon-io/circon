import { defineCloudflareConfig } from '@opennextjs/cloudflare'

/**
 * OpenNext adapter config.
 *
 * `@cloudflare/next-on-pages` is deprecated; this adapter runs Next on the
 * Workers Node.js runtime rather than edge-only, which is what lets Clerk's
 * server SDK work.
 */
export default defineCloudflareConfig()
