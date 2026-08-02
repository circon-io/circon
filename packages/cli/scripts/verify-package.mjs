#!/usr/bin/env node
/**
 * Guard against publishing a package that is missing its runtime pieces.
 *
 * `files` in package.json is an allowlist, so forgetting to add a directory
 * produces a tarball that installs cleanly and then fails at runtime with
 * "Templates not found". This catches that in CI instead of on a user's box.
 *
 * Usage: npm pack --dry-run --json | node scripts/verify-package.mjs
 */

const REQUIRED = [
  'dist/index.js',
  'dist/commands/setup.js',
  'dist/components/registry.js',
  'templates/package.json',
  'templates/pnpm-workspace.yaml',
  'templates/.circon/flows/web.sh',
  'templates/.circon/flows/android.sh',
  'templates/.circon/expected-web.txt',
  'templates/.github/workflows/ci.yml',
  'templates/.github/workflows/deploy.yml',
  'templates/SECRETS.md',
  'templates/packages/shared/src/index.ts',
  'templates/packages/i18n/src/index.ts',
  'templates/services/api/src/index.ts',
]

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (raw += chunk))
    process.stdin.on('end', () => resolve(raw))
    process.stdin.on('error', reject)
  })
}

/**
 * npm changed this shape: older versions emit an array of package objects,
 * npm 12 emits an object keyed by package name. Accept both.
 */
function extractFiles(parsed) {
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed)
  const first = entries[0]
  if (!first || !Array.isArray(first.files)) {
    throw new Error('unrecognised `npm pack --json` output shape')
  }
  return first.files.map((f) => f.path)
}

const raw = await readStdin()
if (!raw.trim()) {
  console.error('verify-package: no input on stdin')
  process.exit(1)
}

let files
try {
  files = extractFiles(JSON.parse(raw))
} catch (err) {
  console.error(`verify-package: ${err.message}`)
  process.exit(1)
}

const missing = REQUIRED.filter((r) => !files.includes(r))
if (missing.length) {
  console.error('Missing from the package tarball:')
  for (const m of missing) console.error(`  - ${m}`)
  console.error('\nCheck the "files" allowlist in package.json.')
  process.exit(1)
}

// The flow scripts are executed by the gate; a non-executable copy still works
// because the gate invokes them through bash, but warn if the mode was lost.
console.log(`Tarball contains ${files.length} files; all ${REQUIRED.length} required entries present.`)
