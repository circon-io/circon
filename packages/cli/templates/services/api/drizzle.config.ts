import { defineConfig } from 'drizzle-kit'

// SQLite, so the same schema runs on D1 (Cloudflare) and libSQL (everywhere else).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
