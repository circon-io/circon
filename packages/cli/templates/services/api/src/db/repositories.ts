import { desc, eq } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { ThingRepository, UserRepository } from '@app/domain'
import { things, users } from './schema.ts'

/** Any SQLite driver drizzle supports: D1 on Cloudflare, libSQL elsewhere. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = BaseSQLiteDatabase<'sync' | 'async', any>

export function thingRepository(db: Database): ThingRepository {
  return {
    async listForOwner(ownerId) {
      const rows = await db.select().from(things).where(eq(things.ownerId, ownerId)).orderBy(desc(things.createdAt))
      return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString() }))
    },
    async insert(thing) {
      await db.insert(things).values({
        id: thing.id,
        ownerId: thing.ownerId,
        name: thing.name,
        createdAt: new Date(thing.createdAt),
      })
    },
  }
}

export function userRepository(db: Database): UserRepository {
  return {
    async upsert(user) {
      await db
        .insert(users)
        .values({ id: user.id, email: user.email, createdAt: new Date() })
        .onConflictDoUpdate({ target: users.id, set: { email: user.email } })
    },
    async remove(id) {
      await db.delete(users).where(eq(users.id, id))
    },
    async list(limit) {
      const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit)
      return rows.map((r) => ({ id: r.id, email: r.email, createdAt: r.createdAt.toISOString() }))
    },
  }
}
