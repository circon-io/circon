import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { run, sh, which } from '../core/exec.ts'
import { type Component, ok, missing, foreign } from './types.ts'

const ANDROID_HOME = () => process.env['ANDROID_HOME'] ?? join(homedir(), 'Android', 'Sdk')
const sdkmanager = () => join(ANDROID_HOME(), 'cmdline-tools', 'latest', 'bin', 'sdkmanager')
const avdmanager = () => join(ANDROID_HOME(), 'cmdline-tools', 'latest', 'bin', 'avdmanager')

/** Known-good fallback if the download page layout changes. */
const CMDLINE_TOOLS_FALLBACK =
  'https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip'

export const androidStudioComponent: Component = {
  id: 'android-studio',
  summary: 'Android Studio (IDE)',
  privileged: true,
  linuxOnly: true,

  async check() {
    // `snap install` exits non-zero when the snap is already present, which is
    // exactly what aborted the old script under `set -e`. Probe first.
    const snap = await run('snap', ['list', 'android-studio'])
    if (snap.ok) return ok('installed via snap')

    if (existsSync('/opt/android-studio') || (await which('android-studio'))) {
      return foreign('installed outside snap')
    }
    return missing('not installed')
  },

  async install() {
    const r = await run('sudo', ['snap', 'install', 'android-studio', '--classic'], {
      stream: true,
    })
    if (!r.ok) throw new Error(`snap install failed (exit ${r.code})`)
  },
}

export const androidSdkComponent: Component = {
  id: 'android-sdk',
  summary: 'Android SDK, platform-tools, emulator and an AVD (headless)',
  requires: ['apt-base'],
  linuxOnly: true,

  async check() {
    if (!existsSync(sdkmanager())) {
      // An existing Android Studio may have laid down an SDK elsewhere.
      const sdkRoot = process.env['ANDROID_SDK_ROOT']
      if (sdkRoot && existsSync(join(sdkRoot, 'platform-tools'))) {
        return foreign(`SDK at ${sdkRoot}`)
      }
      return missing('cmdline-tools not installed')
    }

    const installed = await run(sdkmanager(), ['--list_installed'], { timeoutMs: 60_000 })
    const text = installed.stdout
    const have = {
      platformTools: text.includes('platform-tools'),
      platform: /platforms;android-\d+/.test(text),
      buildTools: /build-tools;[\d.]+/.test(text),
      emulator: text.includes('emulator'),
    }
    const absent = Object.entries(have)
      .filter(([, present]) => !present)
      .map(([name]) => name)

    if (absent.length) return missing(`missing ${absent.join(', ')}`)

    const avds = await run(avdmanager(), ['list', 'avd'], { timeoutMs: 30_000 })
    const hasAvd = avds.stdout.includes('circon_pixel') || avds.stdout.includes('solyd_pixel')
    const api = text.match(/platforms;android-(\d+)/)?.[1] ?? '?'
    return hasAvd ? ok(`API ${api}, AVD ready`) : ok(`API ${api}, no AVD`)
  },

  async install() {
    const home = ANDROID_HOME()
    await run('mkdir', ['-p', join(home, 'cmdline-tools')])

    if (!existsSync(sdkmanager())) {
      const page = await sh(
        'curl -fsSL --max-time 30 https://developer.android.com/studio 2>/dev/null | ' +
          'grep -oE "https://dl\\.google\\.com/android/repository/commandlinetools-linux-[0-9]+_latest\\.zip" | head -1',
      )
      const url = page.stdout.trim() || CMDLINE_TOOLS_FALLBACK
      const r = await sh(
        `set -e
         tmp=$(mktemp -d)
         curl -fL --retry 3 --progress-bar -o "$tmp/tools.zip" ${JSON.stringify(url)}
         unzip -q -o "$tmp/tools.zip" -d "$tmp"
         rm -rf ${JSON.stringify(join(home, 'cmdline-tools', 'latest'))}
         mv "$tmp/cmdline-tools" ${JSON.stringify(join(home, 'cmdline-tools', 'latest'))}
         rm -rf "$tmp"`,
        { stream: true },
      )
      if (!r.ok) throw new Error(`cmdline-tools download failed (exit ${r.code})`)
    }

    await sh(`mkdir -p "$HOME/.android" && touch "$HOME/.android/repositories.cfg"`)
    await sh(`yes | ${JSON.stringify(sdkmanager())} --licenses > /dev/null 2>&1 || true`)

    // Resolve newest STABLE versions rather than pinning something that rots.
    // Numeric sort matters: lexically, android-9 beats android-36.
    const list = await run(sdkmanager(), ['--list'], { timeoutMs: 180_000 })
    const platforms = [...list.stdout.matchAll(/platforms;android-(\d+)/g)]
      .map((m) => parseInt(m[1] ?? '0', 10))
      .sort((a, b) => a - b)
    const api = platforms.at(-1)
    if (!api) throw new Error('could not read the SDK package list')

    const buildTools = [...list.stdout.matchAll(/build-tools;([\d.]+)/g)]
      .map((m) => m[1] ?? '')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .at(-1)

    let sysImage = `system-images;android-${api};google_apis;x86_64`
    if (!list.stdout.includes(sysImage)) {
      const playstore = `system-images;android-${api};google_apis_playstore;x86_64`
      sysImage = list.stdout.includes(playstore) ? playstore : ''
    }

    const packages = [
      'platform-tools',
      `platforms;android-${api}`,
      buildTools ? `build-tools;${buildTools}` : '',
      'emulator',
      sysImage,
    ].filter(Boolean)

    const install = await run(sdkmanager(), ['--install', ...packages], { stream: true })
    if (!install.ok) throw new Error(`sdkmanager install failed (exit ${install.code})`)

    if (sysImage) {
      const avds = await run(avdmanager(), ['list', 'avd'])
      if (!avds.stdout.includes('circon_pixel')) {
        const devices = await run(avdmanager(), ['list', 'device'])
        const deviceArgs = devices.stdout.includes('pixel_7') ? ['-d', 'pixel_7'] : []
        await run(
          avdmanager(),
          ['create', 'avd', '-n', 'circon_pixel', '-k', sysImage, ...deviceArgs, '--force'],
          { input: 'no\n' },
        )
      }
    }
  },
}
