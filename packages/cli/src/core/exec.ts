import { spawn } from 'node:child_process'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
  ok: boolean
}

export interface RunOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** Stream to the terminal as it happens, as well as capturing it. */
  stream?: boolean
  timeoutMs?: number
  input?: string
}

/**
 * Run a command and capture it. Never throws on a non-zero exit — callers
 * decide what a failure means, which is what lets `check()` probe freely.
 */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, ...opts.env },
      stdio: [opts.input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL')
        }, opts.timeoutMs)
      : undefined

    child.stdout?.on('data', (d: Buffer) => {
      const s = d.toString()
      stdout += s
      if (opts.stream) process.stdout.write(s)
    })
    child.stderr?.on('data', (d: Buffer) => {
      const s = d.toString()
      stderr += s
      if (opts.stream) process.stderr.write(s)
    })

    if (opts.input) {
      child.stdin?.write(opts.input)
      child.stdin?.end()
    }

    const finish = (code: number) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr, ok: code === 0 })
    }

    child.on('error', () => finish(127))
    child.on('close', (code) => finish(code ?? 1))
  })
}

/** Run through a shell. Use only when you genuinely need pipes or globs. */
export function sh(command: string, opts: RunOptions = {}): Promise<RunResult> {
  return run('bash', ['-lc', command], opts)
}

/** Is this binary on PATH? The basis of every "is it installed" probe. */
export async function which(binary: string): Promise<string | null> {
  const r = await run('command', ['-v', binary])
  if (r.ok && r.stdout.trim()) return r.stdout.trim()
  // `command` is a shell builtin, so fall back to a shell when spawn missed it
  const s = await sh(`command -v ${binary}`)
  return s.ok && s.stdout.trim() ? s.stdout.trim() : null
}

/** First capture group of `pattern` against `cmd --version`-style output. */
export async function versionOf(
  cmd: string,
  args: string[] = ['--version'],
  pattern = /(\d+\.\d+(?:\.\d+)?)/,
): Promise<string | null> {
  const r = await run(cmd, args)
  const text = `${r.stdout}\n${r.stderr}`
  const m = text.match(pattern)
  return m?.[1] ?? null
}

/** Compare dotted versions. -1 | 0 | 1, missing segments treated as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export function satisfiesMinimum(actual: string, minimum: string): boolean {
  return compareVersions(actual, minimum) >= 0
}
