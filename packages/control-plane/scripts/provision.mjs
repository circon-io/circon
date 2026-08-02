#!/usr/bin/env node
/**
 * Create the resources wrangler cannot declare into existence, then write their
 * ids into the config so `wrangler deploy` can bind them.
 *
 * Durable Objects, assets, vars and observability are all declarative in
 * wrangler.jsonc. A **D1 database is not**: `database_id` must already exist
 * before deploy, so something has to create it once and remember the id. That
 * is this script, and it is idempotent — it adopts an existing database rather
 * than failing or making a second one.
 *
 * This talks to the D1 REST API rather than shelling out to wrangler. `wrangler
 * d1 list` and `d1 create` have no `--json` flag, so the alternative is parsing
 * a human-readable table that changes between releases — exactly the kind of
 * brittleness infrastructure code should not have.
 *
 * Usage:  node scripts/provision.mjs [--write]
 *   --write   persist the resolved id back into wrangler.jsonc
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const configPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'wrangler.jsonc')
const DB_NAME = 'circon'
const API = 'https://api.cloudflare.com/client/v4'

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

/** Pull the uuid out of a Cloudflare API envelope, whichever field carries it. */
export function idFromResult(result) {
  if (!result || typeof result !== 'object') return null
  return result.uuid ?? result.database_id ?? result.id ?? null
}

export function findByName(list, name) {
  if (!Array.isArray(list)) return null
  const match = list.find((db) => db?.name === name)
  return match ? idFromResult(match) : null
}

function credentials(env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN
  const account = env.CLOUDFLARE_ACCOUNT_ID
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set')
  if (!account) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set')
  return { token, account }
}

async function api(path, init = {}) {
  const { token, account } = credentials()
  const res = await fetch(`${API}/accounts/${account}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  })

  const body = await res.json().catch(() => null)
  if (!body?.success) {
    // Surface Cloudflare's own error text: "Authentication error" here almost
    // always means the token is missing D1 · Edit, and saying so beats a 403.
    const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join('; ')
    throw new Error(detail || `Cloudflare API returned HTTP ${res.status}`)
  }
  return body.result
}

async function findDatabase(name) {
  // The list endpoint paginates; a name filter avoids caring about that.
  const result = await api(`/d1/database?name=${encodeURIComponent(name)}&per_page=50`)
  return findByName(result, name)
}

async function createDatabase(name) {
  const result = await api('/d1/database', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return idFromResult(result)
}

async function main() {
  const write = process.argv.includes('--write')

  let databaseId = await findDatabase(DB_NAME)
  if (databaseId) {
    console.log(`D1 "${DB_NAME}" already exists (${databaseId}) — adopting it.`)
  } else {
    console.log(`D1 "${DB_NAME}" not found; creating it.`)
    databaseId = await createDatabase(DB_NAME)
    if (!databaseId) throw new Error('D1 was created but the API returned no id')
    console.log(`Created D1 "${DB_NAME}" (${databaseId}).`)
  }

  if (!write) {
    console.log('\nRe-run with --write to persist the id into wrangler.jsonc.')
    console.log(`database_id=${databaseId}`)
    return
  }

  writeFileSync(configPath, injectDatabaseId(readFileSync(configPath, 'utf8'), databaseId))
  console.log(`wrangler.jsonc now binds D1 ${databaseId}.`)
}

if (process.argv[1] && process.argv[1].endsWith('provision.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
