import { existsSync } from 'node:fs'
import { run, sh, which } from '../core/exec.ts'
import { PINNED } from '../core/spec.ts'
import { type Component, ok, missing, foreign } from './types.ts'

export const ollamaComponent: Component = {
  id: 'ollama',
  summary: 'Ollama local inference server',
  privileged: true,
  linuxOnly: true,

  async check() {
    if (!(await which('ollama'))) return missing('not installed')
    const active = await run('systemctl', ['is-active', '--quiet', 'ollama'])
    return active.ok ? ok('running') : ok('installed, service stopped')
  },

  async install() {
    const r = await sh('curl -fsSL https://ollama.com/install.sh | sh', { stream: true })
    if (!r.ok) throw new Error(`ollama install failed (exit ${r.code})`)
    await run('sudo', ['systemctl', 'enable', '--now', 'ollama'])
  },
}

/**
 * The component that motivated the whole redesign: re-running setup must never
 * re-download several gigabytes. `ollama list` is the probe — if the tag is
 * already there, we do nothing at all.
 */
export const ollamaModelComponent: Component = {
  id: 'ollama-model',
  summary: `Local coding model (${PINNED.ollamaModel})`,
  requires: ['ollama'],
  linuxOnly: true,

  async check() {
    if (!(await which('ollama'))) return missing('ollama not installed')

    const list = await run('ollama', ['list'], { timeoutMs: 15_000 })
    if (!list.ok) return missing('ollama not responding')

    // `ollama list` prints "qwen2.5-coder:7b   <id>   4.7 GB   ..."
    const wanted = PINNED.ollamaModel
    const present = list.stdout
      .split('\n')
      .some((line) => line.trim().startsWith(wanted))

    return present ? ok(`${wanted} already pulled`) : missing(`${wanted} not pulled`)
  },

  async install() {
    const r = await run('ollama', ['pull', PINNED.ollamaModel], { stream: true })
    if (!r.ok) throw new Error(`ollama pull failed (exit ${r.code})`)
  },
}

export const ollamaTuningComponent: Component = {
  id: 'ollama-tuning',
  summary: 'Ollama flash attention (VRAM efficiency)',
  requires: ['ollama'],
  privileged: true,
  linuxOnly: true,

  async check() {
    const file = '/etc/systemd/system/ollama.service.d/override.conf'
    if (!existsSync(file)) return missing('no override.conf')
    const r = await sh(`grep -q OLLAMA_FLASH_ATTENTION ${file}`)
    return r.ok ? ok('flash attention on') : missing('override present but unset')
  },

  async install() {
    // A whole file, written once — not an append, so re-running cannot
    // accumulate duplicate stanzas the way the old sysctl handling did.
    await run('sudo', ['mkdir', '-p', '/etc/systemd/system/ollama.service.d'])
    const content = '[Service]\nEnvironment="OLLAMA_FLASH_ATTENTION=1"\n'
    const r = await sh(
      `printf '%s' ${JSON.stringify(content)} | sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null`,
    )
    if (!r.ok) throw new Error('could not write ollama override')
    await run('sudo', ['systemctl', 'daemon-reload'])
    await run('sudo', ['systemctl', 'restart', 'ollama'])
  },
}

export const aiderComponent: Component = {
  id: 'aider',
  summary: 'aider (architect/editor coding agent)',

  async check() {
    const path = await which('aider')
    if (!path) return missing('not installed')
    if (!path.includes('/.local/') && !path.includes('/uv/')) {
      return foreign(`installed at ${path}`)
    }
    return ok(path)
  },

  async install() {
    if (!(await which('uv'))) {
      const r = await sh('curl -LsSf https://astral.sh/uv/install.sh | sh', { stream: true })
      if (!r.ok) throw new Error('uv install failed')
    }
    const r = await sh('uv tool install --python 3.12 aider-chat && uv tool update-shell', {
      stream: true,
    })
    if (!r.ok) throw new Error(`aider install failed (exit ${r.code})`)
  },
}

/**
 * context7 supplies current library documentation to an agent at call time.
 *
 * The stack leans on packages that move fast — HeroUI Native is at 1.0 beta —
 * where a model's training data is confidently wrong. Registering it with
 * Claude Code is what makes the review pass cite the current API rather than
 * last year's.
 */
export const context7Component: Component = {
  id: 'context7',
  summary: 'context7 MCP server (current library docs for agents)',
  requires: ['js-globals'],

  async check() {
    if (!(await which('claude'))) return missing('claude not installed')
    const list = await run('claude', ['mcp', 'list'], { timeoutMs: 30_000 })
    if (!list.ok) return missing('could not list MCP servers')
    return /context7/i.test(list.stdout) ? ok('registered') : missing('not registered')
  },

  async install() {
    const added = await run(
      'claude',
      ['mcp', 'add', '--scope', 'user', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp'],
      { stream: true, timeoutMs: 120_000 },
    )
    if (!added.ok) {
      throw new Error(`could not register context7 (exit ${added.code})`)
    }
  },
}
