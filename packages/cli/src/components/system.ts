import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { run, sh, which } from '../core/exec.ts'
import { paths } from '../core/paths.ts'
import { type Component, ok, missing, foreign } from './types.ts'

const APT_BASE = [
  'curl', 'wget', 'git', 'build-essential', 'unzip', 'jq', 'tmux', 'screen', 'htop',
  'software-properties-common', 'ca-certificates', 'gnupg', 'openssl',
  'openssh-server', 'openjdk-17-jdk',
]

async function aptInstalled(pkg: string): Promise<boolean> {
  const r = await run('dpkg-query', ['-W', '-f=${Status}', pkg])
  return r.ok && r.stdout.includes('install ok installed')
}

export const aptBaseComponent: Component = {
  id: 'apt-base',
  summary: 'Base packages (build tools, git, jq, JDK 17, openssh)',
  privileged: true,
  linuxOnly: true,

  async check() {
    const absent: string[] = []
    for (const pkg of APT_BASE) {
      if (!(await aptInstalled(pkg))) absent.push(pkg)
    }
    if (absent.length === 0) return ok(`${APT_BASE.length} packages present`)
    return missing(`${absent.length} missing: ${absent.slice(0, 4).join(', ')}${absent.length > 4 ? '…' : ''}`)
  },

  async install() {
    await run('sudo', ['apt', 'update'], { stream: true })
    const r = await run('sudo', ['apt', 'install', '-y', ...APT_BASE], { stream: true })
    if (!r.ok) throw new Error(`apt install failed (exit ${r.code})`)
  },
}

export const sshComponent: Component = {
  id: 'ssh',
  summary: 'OpenSSH server enabled',
  requires: ['apt-base'],
  privileged: true,
  linuxOnly: true,

  async check() {
    const r = await run('systemctl', ['is-enabled', 'ssh'])
    return r.ok ? ok('enabled') : missing('not enabled')
  },

  async install() {
    await run('sudo', ['systemctl', 'enable', '--now', 'ssh'])
  },
}

export const kvmComponent: Component = {
  id: 'kvm',
  summary: 'KVM virtualisation (Android emulator acceleration)',
  privileged: true,
  linuxOnly: true,

  async check() {
    if (!existsSync('/dev/kvm')) return missing('/dev/kvm absent')
    const groups = await run('id', ['-nG'])
    const inGroup = groups.stdout.split(/\s+/).includes('kvm')
    return inGroup
      ? ok('/dev/kvm present, user in kvm group')
      : missing('present, but user not in kvm group (reboot after setup)')
  },

  async install() {
    const pkgs = [
      'qemu-system', 'libvirt-daemon-system', 'libvirt-clients', 'bridge-utils', 'virt-manager',
    ]
    const r = await run('sudo', ['apt', 'install', '-y', ...pkgs], { stream: true })
    if (!r.ok) throw new Error(`kvm install failed (exit ${r.code})`)
    const user = process.env['USER'] ?? ''
    await run('sudo', ['usermod', '-aG', 'kvm', user])
    await run('sudo', ['usermod', '-aG', 'libvirt', user])
  },
}

export const dockerComponent: Component = {
  id: 'docker',
  summary: 'Docker Engine',
  privileged: true,
  linuxOnly: true,

  async check() {
    const path = await which('docker')
    if (!path) return missing('not installed')

    // Ubuntu's docker.io package and Docker's own convenience script both work,
    // but we only ever install the latter. Anything else is adopted untouched.
    const fromDistro = await aptInstalled('docker.io')
    if (fromDistro) return foreign('docker.io from the distro repository')

    const groups = await run('id', ['-nG'])
    return groups.stdout.split(/\s+/).includes('docker')
      ? ok('installed, user in docker group')
      : ok('installed (user not in docker group until reboot)')
  },

  async install() {
    const r = await sh(
      'curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sudo sh /tmp/get-docker.sh && rm -f /tmp/get-docker.sh',
      { stream: true },
    )
    if (!r.ok) throw new Error(`docker install failed (exit ${r.code})`)
    await run('sudo', ['usermod', '-aG', 'docker', process.env['USER'] ?? ''])
  },
}

export const nvidiaComponent: Component = {
  id: 'nvidia',
  summary: 'NVIDIA drivers and CUDA toolkit',
  privileged: true,
  linuxOnly: true,

  async check() {
    if (!(await which('nvidia-smi'))) return missing('nvidia-smi not found')
    const r = await run('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'])
    if (!r.ok) return missing('driver installed but not responding')
    return ok(r.stdout.trim().split('\n')[0] ?? 'present')
  },

  async install() {
    const r = await run('sudo', ['ubuntu-drivers', 'install'], { stream: true })
    if (!r.ok) throw new Error(`driver install failed (exit ${r.code})`)
    await run('sudo', ['apt', 'install', '-y', 'nvidia-cuda-toolkit'], { stream: true })
  },
}

/**
 * The old script appended this line to /etc/sysctl.conf on every run, so a
 * machine set up five times had five copies. A drop-in file is declarative:
 * writing it twice is the same as writing it once.
 */
export const sysctlComponent: Component = {
  id: 'sysctl',
  summary: 'inotify watch limit (Expo/Metro ENOSPC fix)',
  privileged: true,
  linuxOnly: true,

  async check() {
    const r = await run('sysctl', ['-n', 'fs.inotify.max_user_watches'])
    const current = parseInt(r.stdout.trim(), 10)
    if (Number.isNaN(current)) return missing('cannot read current value')
    return current >= 524288
      ? ok(`max_user_watches=${current}`)
      : missing(`max_user_watches=${current}, want 524288`)
  },

  async install() {
    const r = await sh(
      "printf 'fs.inotify.max_user_watches=524288\\n' | sudo tee /etc/sysctl.d/99-circon.conf > /dev/null && sudo sysctl --system > /dev/null",
    )
    if (!r.ok) throw new Error('could not write sysctl drop-in')
  },
}

export const gitIdentityComponent: Component = {
  id: 'git-identity',
  summary: 'Git identity for agent commits',

  async check() {
    const name = await run('git', ['config', '--global', 'user.name'])
    const email = await run('git', ['config', '--global', 'user.email'])
    if (name.ok && name.stdout.trim() && email.ok && email.stdout.trim()) {
      return ok(`${name.stdout.trim()} <${email.stdout.trim()}>`)
    }
    return missing('unset')
  },

  async install() {
    await run('git', ['config', '--global', 'user.name', 'AI Developer'])
    await run('git', ['config', '--global', 'user.email', 'ai@localhost'])
  },
}

/**
 * One file the CLI owns outright, sourced by ~/.bashrc through a single guarded
 * line. Adding a PATH entry later rewrites this file and never touches .bashrc
 * again — which is what stops the append-forever problem at the source.
 */
export const shellEnvComponent: Component = {
  id: 'shell-env',
  summary: 'Shell environment (PATH for Android SDK, tools)',

  async check() {
    const bashrc = `${process.env['HOME']}/.bashrc`
    if (!existsSync(paths.envFile)) return missing('env.sh not written')
    if (!existsSync(bashrc)) return missing('~/.bashrc absent')
    const sourced = readFileSync(bashrc, 'utf8').includes(paths.envFile)
    return sourced ? ok('sourced from ~/.bashrc') : missing('written but not sourced')
  },

  async install() {
    mkdirSync(paths.config, { recursive: true })
    writeFileSync(
      paths.envFile,
      [
        '# Managed by circon. Edits here are overwritten — change the CLI instead.',
        'export ANDROID_HOME="$HOME/Android/Sdk"',
        'export ANDROID_SDK_ROOT="$ANDROID_HOME"',
        'export PATH="$PATH:$ANDROID_HOME/emulator"',
        'export PATH="$PATH:$ANDROID_HOME/platform-tools"',
        'export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin"',
        'export PATH="$PATH:$HOME/.local/bin"',
        '',
      ].join('\n'),
    )

    const bashrc = `${process.env['HOME']}/.bashrc`
    const existing = existsSync(bashrc) ? readFileSync(bashrc, 'utf8') : ''
    if (!existing.includes(paths.envFile)) {
      writeFileSync(
        bashrc,
        `${existing}\n# circon environment\n[ -f "${paths.envFile}" ] && . "${paths.envFile}"\n`,
      )
    }
  },
}
