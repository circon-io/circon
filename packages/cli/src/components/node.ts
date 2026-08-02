import { run, sh, which, versionOf, satisfiesMinimum } from '../core/exec.ts'
import { PINNED, FLOATING } from '../core/spec.ts'
import { type Component, ok, missing, outdated, foreign } from './types.ts'

/**
 * Node is the component most likely to already exist, and the one most easily
 * broken by installing over it. nvm, fnm, volta and asdf all put a shim on PATH
 * that a NodeSource apt package will silently shadow — leaving two Nodes and a
 * machine whose behavior depends on shell startup order.
 *
 * So: if a version manager owns Node and the version is adequate, we adopt it.
 */
async function nodeIsManagedElsewhere(nodePath: string): Promise<string | null> {
  const managers: Array<[string, RegExp]> = [
    ['nvm', /\/\.nvm\//],
    ['fnm', /\/\.fnm\/|\/fnm_multishells\//],
    ['volta', /\/\.volta\//],
    ['asdf', /\/\.asdf\//],
    ['mise', /\/\.local\/share\/mise\/|\/\.mise\//],
    ['homebrew', /\/homebrew\/|\/Cellar\//],
  ]
  for (const [name, pattern] of managers) {
    if (pattern.test(nodePath)) return name
  }
  return null
}

export const nodeComponent: Component = {
  id: 'node',
  summary: `Node.js ${PINNED.nodeMajor}.x (minimum ${PINNED.nodeMinimum})`,
  privileged: true,

  async check() {
    const path = await which('node')
    if (!path) return missing('not on PATH')

    const version = await versionOf('node', ['--version'])
    if (!version) return missing('present but version unreadable')

    const manager = await nodeIsManagedElsewhere(path)

    if (!satisfiesMinimum(version, PINNED.nodeMinimum)) {
      return outdated(
        manager
          ? `v${version} via ${manager}, below ${PINNED.nodeMinimum} — upgrade it with ${manager}, not with circon`
          : `v${version}, below ${PINNED.nodeMinimum}`,
      )
    }

    // Adequate and owned by someone else: hands off.
    if (manager) return foreign(`v${version} via ${manager}`)

    const major = parseInt(version.split('.')[0] ?? '0', 10)
    if (major < PINNED.nodeMajor) {
      return ok(`v${version} (${PINNED.nodeMajor}.x preferred for web automation)`)
    }
    return ok(`v${version}`)
  },

  async install() {
    const r = await sh(
      `curl -fsSL https://deb.nodesource.com/setup_${PINNED.nodeMajor}.x | sudo -E bash - && sudo apt install -y nodejs`,
      { stream: true },
    )
    if (!r.ok) throw new Error(`NodeSource install failed (exit ${r.code})`)
  },

  async upgrade() {
    await this.install()
  },
}

export const jsGlobalsComponent: Component = {
  id: 'js-globals',
  summary: 'Global npm tooling (pnpm, agent-device, claude-code, eas-cli)',
  requires: ['node'],
  privileged: true,

  async check() {
    const binaries: Record<string, string> = {
      pnpm: 'pnpm',
      yarn: 'yarn',
      'agent-device': 'agent-device',
      '@anthropic-ai/claude-code': 'claude',
      'eas-cli': 'eas',
    }

    const absent: string[] = []
    for (const [pkg, binary] of Object.entries(binaries)) {
      if (!(await which(binary))) absent.push(pkg)
    }

    if (absent.length === 0) return ok('all present')
    if (absent.length === Object.keys(binaries).length) return missing('none installed')
    return missing(`missing: ${absent.join(', ')}`)
  },

  async install() {
    // Install individually: one unpublished or renamed package should not stop
    // the other four from landing.
    const failures: string[] = []
    for (const pkg of FLOATING.npmGlobals) {
      const r = await run('sudo', ['npm', 'install', '-g', pkg], { stream: true })
      if (!r.ok) failures.push(pkg)
    }
    if (failures.length) {
      throw new Error(`failed to install: ${failures.join(', ')}`)
    }
  },
}
