import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Env } from '../src/env.ts'

/**
 * D1 for tests: real SQLite with the real migrations applied.
 *
 * D1 *is* SQLite, and `?1`-style parameters are native SQLite syntax, so route
 * handlers run unmodified against this. That is worth more than a mock, because
 * a query with a typo or a missing column fails here exactly as it would in
 * production.
 */

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

function bindable(values: unknown[]): SQLInputValue[] {
  return values.map((v) => {
    if (v === undefined) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    return v as SQLInputValue
  })
}

export function fakeD1(): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(':memory:')
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrations, file), 'utf8'))
  }

  const statement = (sql: string, params: unknown[]): D1PreparedStatement => {
    const s = {
      bind: (...values: unknown[]) => statement(sql, values),
      first: async (column?: string) => {
        const row = db.prepare(sql).get(...bindable(params)) as Record<string, unknown> | undefined
        if (!row) return null
        return column ? (row[column] ?? null) : { ...row }
      },
      all: async () => ({
        results: (db.prepare(sql).all(...bindable(params)) as Array<Record<string, unknown>>)
          .map((row) => ({ ...row })),
        success: true,
        meta: {},
      }),
      run: async () => {
        const result = db.prepare(sql).run(...bindable(params))
        return {
          success: true,
          meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
        }
      },
      raw: async () => db.prepare(sql).all(...bindable(params)).map((row) => Object.values(row as object)),
    }
    return s as unknown as D1PreparedStatement
  }

  const d1 = {
    raw: db,
    prepare: (sql: string) => statement(sql, []),
    batch: async (statements: D1PreparedStatement[]) =>
      Promise.all(statements.map((st) => (st as unknown as { run: () => Promise<unknown> }).run())),
    exec: async (sql: string) => {
      db.exec(sql)
      return { count: 0, duration: 0 }
    },
    dump: async () => new ArrayBuffer(0),
  }
  return d1 as unknown as D1Database & { raw: DatabaseSync }
}

export interface RecordedCommand {
  runnerId: string
  path: string
  body: unknown
}

/**
 * Durable Object namespace that records what was sent to each runner's object,
 * and answers `/state` with whatever the test set.
 */
export function fakeRunners(states: Record<string, unknown> = {}) {
  const sent: RecordedCommand[] = []
  const namespace = {
    idFromName: (name: string) => name,
    get: (runnerId: string) => ({
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        const path = new URL(request.url).pathname
        const text = request.method === 'POST' ? await request.text() : ''
        sent.push({ runnerId, path, body: text ? JSON.parse(text) : null })
        if (path.endsWith('/state')) return Response.json(states[runnerId] ?? { status: 'offline' })
        if (path.endsWith('/logs')) return Response.json({ lines: [] })
        return Response.json({ ok: true, delivered: 1 })
      },
    }),
  }
  return { namespace: namespace as unknown as Env['RUNNER'], sent }
}

export function fakeEnv(overrides: Partial<Env> = {}) {
  const runners = fakeRunners()
  const env: Env = {
    DB: fakeD1(),
    RUNNER: runners.namespace,
    RUNNER_SECRET_PEPPER: 'test-pepper',
    DASHBOARD_ORIGIN: 'https://app.example.test',
    ...overrides,
  }
  return { env, sent: runners.sent, db: (env.DB as unknown as { raw: DatabaseSync }).raw }
}

/** Seed a runner row and return its id. */
export function seedRunner(db: DatabaseSync, opts: { id: string; org: string; lastSeenAt?: string | null }) {
  db.prepare(
    `INSERT INTO runners (id, name, org, token_hash, created_at, last_seen_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).run(opts.id, opts.id, opts.org, `hash-${opts.id}`, new Date().toISOString(), opts.lastSeenAt ?? null)
  return opts.id
}

/** A connected, active project. */
export function seedProject(db: DatabaseSync, opts: { org: string; slug: string; id?: string }) {
  const integration = `itg_${opts.slug}`
  db.prepare(
    `INSERT OR IGNORE INTO integrations (id, org, provider, external_id, created_at)
     VALUES (?1, ?2, 'github', ?3, ?4)`,
  ).run(integration, opts.org, `ext-${opts.slug}`, new Date().toISOString())
  const id = opts.id ?? `prj_${opts.slug}`
  db.prepare(
    `INSERT INTO projects (id, org, integration_id, slug, external_id, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).run(id, opts.org, integration, opts.slug, `repo-${opts.slug}`, new Date().toISOString())
  return id
}
