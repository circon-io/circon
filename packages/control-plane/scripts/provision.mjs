#!/usr/bin/env node
/**
 * Create the resources wrangler cannot declare into existence, then write their
 * ids into the config so `wrangler deploy` can bind them.
 *
 * Durable Objects, routes, assets and observability are all declarative in
 * wrangler.jsonc. A **D1 database is not**: `database_id` must already exist
 * before deploy, so something has to create it once and remember the id. That
 * is this script, and it is idempotent — it adopts an existing database rather
 * than failing or making a second one.
 *
 * Usage:  node scripts/provision.mjs [--write]
 *   --write   persist the resolved id back into wrangler.jsonc
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, '..', 'wrangler.jsonc')
const DB_NAME = 'circon'

function wrangler(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('npx', ['wrangler', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    if (allowFailure) return ''
    const detail = error.stderr || error.stdout || error.message
    throw new Error(`wrangler ${args.join(' ')} failed:\n${detail}`)
  }
}

/**
 * `wrangler d1 list --json` is the authoritative answer to "does it exist".
 * Creating unconditionally would either fail or silently produce a duplicate
 * database with a different id, which is far worse than an extra API call.
 */
function findDatabase(name) {
  const raw = wrangler(['d1', 'list', '--json'], { allowFailure: true })
  if (!raw.trim()) return null
  try {
    const list = JSON.parse(raw)
    const match = (Array.isArray(list) ? list : []).find((d) => d.name === name)
    return match?.uuid ?? match?.database_id ?? null
  } catch {
    return null
  }
}

function createDatabase(name) {
  const raw = wrangler(['d1', 'create', name, '--json'])
  try {
    const created = JSON.parse(raw)
    return created.uuid ?? created.database_id ?? null
  } catch {
    // Older wrangler prints prose rather than JSON; recover the id from it.
    const match = raw.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
    return match?.[1] ?? null
  }
}

/**
 * Swap the database_id in wrangler.jsonc. Exported so the substitution is
 * tested — a regex that silently matched nothing would deploy a Worker bound
 * to PLACEHOLDER_D1_ID, and the failure would only appear at runtime.
 */
export function injectDatabaseId(config, databaseId) {
  const pattern = /("database_id"\s*:\s*")[^"]*(")/
  if (!pattern.test(config)) {
    throw new Error('could not find a database_id field to update in wrangler.jsonc')
  }
  return config.replace(pattern, `$1${databaseId}$2`)
}

function main() {
  const write = process.argv.includes('--write')

  let databaseId = findDatabase(DB_NAME)
  if (databaseId) {
    console.log(`D1 "${DB_NAME}" already exists (${databaseId}) — adopting it.`)
  } else {
    console.log(`D1 "${DB_NAME}" not found; creating it.`)
    databaseId = createDatabase(DB_NAME)
    if (!databaseId) throw new Error('could not determine the new database id')
    console.log(`Created D1 "${DB_NAME}" (${databaseId}).`)
  }

  if (!write) {
    console.log('\nRe-run with --write to persist the id into wrangler.jsonc.')
    console.log(`database_id=${databaseId}`)
    return
  }

  const config = readFileSync(configPath, 'utf8')
  writeFileSync(configPath, injectDatabaseId(config, databaseId))
  console.log(`wrangler.jsonc now binds D1 ${databaseId}.`)
}

if (process.argv[1] && process.argv[1].endsWith('provision.mjs')) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
