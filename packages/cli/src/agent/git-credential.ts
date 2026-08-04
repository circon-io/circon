import { run, which } from '../core/exec.ts'
import { cloneCredential } from './control-plane.ts'

/**
 * Authenticating git against GitHub without ever storing a credential.
 *
 * The obvious approach — clone from `https://x-access-token:<token>@github.com/…`
 * — fails twice over: the token lands in `.git/config` where it outlives the run,
 * and it expires after an hour, so the *second* iteration's push fails with a
 * bare 403 long after the URL was written.
 *
 * So git is configured to call back into this CLI. Every git operation that needs
 * credentials asks the control plane for a fresh repository-scoped token, uses
 * it, and forgets it. Clone, fetch, pull and push all work, nothing is persisted,
 * and expiry stops being something anyone has to think about.
 *
 * `useHttpPath` is what makes this possible: without it git omits the path from
 * the request and the helper cannot tell which repository is being asked about.
 */

const HOST = 'github.com'

/**
 * How git should invoke us. `!` marks a shell command rather than a
 * `git-credential-<name>` binary on PATH.
 *
 * The installed binary is preferred; running from source falls back to the
 * interpreter and entry point, so `node src/index.ts` behaves the same.
 */
export async function helperCommand(): Promise<string> {
  if (await which('circon')) return '!circon git-credential'
  const entry = process.argv[1]
  if (!entry) return '!circon git-credential'
  return `!"${process.execPath}" "${entry}" git-credential`
}

/**
 * Flags for a git command that has no repository yet — a clone.
 *
 * The empty `credential.helper` first resets the list, so an inherited global
 * helper (a keychain, a `gh` integration) cannot answer ahead of us and offer a
 * stale personal credential.
 */
export async function credentialFlags(): Promise<string[]> {
  return [
    '-c', 'credential.helper=',
    '-c', `credential.helper=${await helperCommand()}`,
    '-c', 'credential.useHttpPath=true',
  ]
}

/** Persist the same configuration in a checkout, for every later git command. */
export async function configureCredentialHelper(dir: string): Promise<void> {
  const key = `credential.https://${HOST}`
  await run('git', ['-C', dir, 'config', '--local', '--unset-all', `${key}.helper`])
  await run('git', ['-C', dir, 'config', '--local', `${key}.helper`, await helperCommand()])
  await run('git', ['-C', dir, 'config', '--local', `${key}.useHttpPath`, 'true'])
}

/** `https://github.com/owner/repo.git` for a project slug. */
export function slugToHttps(slug: string): string | null {
  const parts = slug.split('__')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return `https://${HOST}/${parts[0]}/${parts[1]}.git`
}

/**
 * The path git sends back — `owner/repo.git`, or `owner/repo` — as a slug.
 *
 * Returns null for anything else, so an unexpected request is declined rather
 * than answered with a token for a repository we guessed at.
 */
export function pathToSlug(path: string | undefined): string | null {
  if (!path) return null
  const parts = path.replace(/^\/+/, '').replace(/\.git$/, '').split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  if (parts.some((p) => p.includes('__') || p === '..')) return null
  return `${parts[0]}__${parts[1]}`
}

export interface CredentialRequest {
  protocol?: string
  host?: string
  path?: string
}

/** git's credential protocol: `key=value` lines, blank line terminated. */
export function parseRequest(stdin: string): CredentialRequest {
  const out: CredentialRequest = {}
  for (const line of stdin.split('\n')) {
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq)
    const value = line.slice(eq + 1)
    if (key === 'protocol' || key === 'host' || key === 'path') out[key] = value
  }
  return out
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * `circon git-credential <get|store|erase>`.
 *
 * Exiting 0 with no output means "no credential", which git treats as a prompt
 * or a failure — never as an error worth reporting. That is deliberate: a runner
 * with an SSH key configured must keep working.
 */
export async function gitCredentialCommand(operation: string | undefined): Promise<number> {
  // Nothing is stored, so there is nothing to store or erase.
  if (operation !== 'get') return 0

  const request = parseRequest(await readStdin())
  if (request.protocol !== 'https' || request.host !== HOST) return 0

  const slug = pathToSlug(request.path)
  if (!slug) return 0

  const credential = await cloneCredential(slug)
  if (!credential?.token) return 0

  // x-access-token is GitHub's documented username for an App token.
  process.stdout.write(`username=x-access-token\npassword=${credential.token}\n`)
  return 0
}
