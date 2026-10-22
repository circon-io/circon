import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * The schema, in SQLite so it runs unchanged on D1 and on libSQL. Change it
 * here, then `pnpm --filter @app/api db:generate` writes the migration.
 */

/** A local copy of Clerk users, kept in step by the Clerk webhook. */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const things = sqliteTable(
  'things',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('things_owner').on(t.ownerId, t.createdAt)],
)
