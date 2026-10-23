import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { run, sh, which, versionOf } from '../core/exec.ts'
import { readEnvFile } from '../core/config.ts'
import { paths } from '../core/paths.ts'
import { PINNED } from '../core/spec.ts'
import { type Component, ok, missing, outdated, foreign } from './types.ts'

/**
 * What a macOS runner needs that a Linux one gets elsewhere, and the one thing
 * a Linux runner needs to test on an iPhone over USB.
 *
 * A Mac runner tests iOS locally — the simulator, or a phone on the cable —
 * which is the whole reason to have one: no SSH transport to a separate Mac.
 */

export const homebrewComponent: Component = {
  id: 'homebrew',
  summary: 'Homebrew (the package manager everything else on macOS comes from)',
  platforms: ['darwin'],

  async check() {
    const version = await versionOf('brew', ['--version'], /Homebrew (\d+\.\d+(?:\.\d+)?)/)
    return version ? ok(`Homebrew ${version}`) : missing('not installed')
  },

  async install() {
    const r = await sh(
      'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      { stream: true },
    )
    if (!r.ok) throw new Error(`Homebrew install failed (exit ${r.code})`)
  },
}

/** JDK 17 for the Android tools. Keg-only in Homebrew, so found by its prefix. */
export async function javaHome(): Promise<string | null> {
  const registered = await run('/usr/libexec/java_home', ['-v', '17'])
  if (registered.ok && registered.stdout.trim()) return registered.stdout.trim()
  const prefix = await run('brew', ['--prefix', 'openjdk@17'])
  const home = join(prefix.stdout.trim(), 'libexec', 'openjdk.jdk', 'Contents', 'Home')
  return prefix.ok && existsSync(home) ? home : null
}

export const javaComponent: Component = {
  id: 'java',
  summary: 'JDK 17 for the Android SDK tools',
  platforms: ['darwin'],
  requires: ['homebrew'],

  async check() {
    const home = await javaHome()
    return home ? ok(home) : missing('no JDK 17')
  },

  async install() {
    const r = await run('brew', ['install', 'openjdk@17'], { stream: true })
    if (!r.ok) throw new Error(`brew install openjdk@17 failed (exit ${r.code})`)
  },
}

/**
 * Xcode cannot be installed unattended: it comes from the App Store and needs
 * an Apple ID and a license acceptance. So this component checks, and its
 * install explains instead of guessing.
 */
export const xcodeComponent: Component = {
  id: 'xcode',
  summary: 'Xcode (builds and runs iOS apps)',
  platforms: ['darwin'],

  async check() {
    const path = await run('xcode-select', ['-p'])
    if (!path.ok || !path.stdout.includes('Xcode')) return missing('Xcode is not selected (only Command Line Tools?)')
    const version = await versionOf('xcodebuild', ['-version'], /Xcode (\d+\.\d+(?:\.\d+)?)/)
    return version ? ok(`Xcode ${version}`) : missing('xcodebuild does not run — accept the license')
  },

  async install() {
    throw new Error(
      'install Xcode from the App Store, then run: ' +
        'sudo xcode-select -s /Applications/Xcode.app && sudo xcodebuild -license accept',
    )
  },
}

export const iosSimulatorComponent: Component = {
  id: 'ios-simulator',
  summary: 'An iOS simulator runtime',
  platforms: ['darwin'],
  requires: ['xcode'],

  async check() {
    if (!(await which('xcrun'))) return missing('no xcrun')
    const runtimes = await run('xcrun', ['simctl', 'list', 'runtimes'], { timeoutMs: 30_000 })
    const ios = runtimes.stdout.split('\n').find((l) => /^iOS \d/.test(l.trim()))
    return ios ? ok(ios.trim().split(' (')[0] ?? 'iOS runtime') : missing('no iOS runtime')
  },

  async install() {
    const r = await run('xcodebuild', ['-downloadPlatform', 'iOS'], { stream: true })
    if (!r.ok) throw new Error(`could not download the iOS platform (exit ${r.code})`)
  },
}

/**
 * Testing on a real iPhone from Linux: usbmuxd talks to the phone over USB,
 * go-ios lists apps and runs WebDriverAgent, which exposes the accessibility
 * hierarchy the gate asserts on. Signing and installing is xtool's, below.
 */
export const iosDeviceComponent: Component = {
  id: 'ios-device',
  summary: 'USB iPhone support (usbmuxd, go-ios)',
  platforms: ['linux'],
  privileged: true,
  requires: ['js-globals'],

  async check() {
    const absent = [
      (await which('usbmuxd')) ? null : 'usbmuxd',
      (await which('ios')) ? null : 'go-ios',
    ].filter(Boolean)
    return absent.length ? missing(`missing ${absent.join(', ')}`) : ok('usbmuxd and go-ios present')
  },

  async install() {
    if (!(await which('usbmuxd'))) {
      const r = await run('sudo', ['apt-get', 'install', '-y', 'usbmuxd'], { stream: true })
      if (!r.ok) throw new Error(`apt-get install usbmuxd failed (exit ${r.code})`)
    }
    if (!(await which('ios'))) {
      const r = await run('sudo', ['npm', 'install', '-g', 'go-ios'], { stream: true })
      if (!r.ok) throw new Error(`npm install -g go-ios failed (exit ${r.code})`)
    }
  },
}

// ---- signing and installing on a USB iPhone, from Linux ------------------------

/**
 * The App Store Connect API key xtool logs in with, written by `circon config`.
 * A key, not an Apple ID: it works unattended, with no 2FA prompt and no
 * private API, which is what a runner needs.
 */
export interface AppleKey {
  keyId: string
  issuerId: string
  keyPath: string
}

export function appleKey(env: Record<string, string> = readEnvFile('apple')): AppleKey | null {
  const keyId = env['APPLE_ASC_KEY_ID']
  const issuerId = env['APPLE_ASC_ISSUER_ID']
  const keyPath = env['APPLE_ASC_KEY_PATH']
  return keyId && issuerId && keyPath ? { keyId, issuerId, keyPath } : null
}

/**
 * `xtool auth login --mode key` asks for these three, one line each, and has
 * no flags for them. Answering its prompts is its supported interface; writing
 * its token store directly would not be.
 */
export function xtoolLoginInput(key: AppleKey): string {
  return `${key.keyId}\n${key.issuerId}\n${key.keyPath}\n`
}

/** The AppImage architecture name for a Node `process.arch`. */
export function appImageArch(arch: string = process.arch): 'x86_64' | 'aarch64' | null {
  if (arch === 'x64') return 'x86_64'
  if (arch === 'arm64') return 'aarch64'
  return null
}

export function xtoolDownloadUrl(version: string, arch: 'x86_64' | 'aarch64'): string {
  return `https://github.com/xtool-org/xtool/releases/download/${version}/xtool-${arch}.AppImage`
}

export function webDriverAgentUrl(version: string): string {
  return `https://github.com/appium/WebDriverAgent/releases/download/v${version}/WebDriverAgentRunner-Runner.zip`
}

/** Where circon puts xtool: the extracted AppImage, and a launcher on PATH. */
const xtoolDir = () => join(paths.share, 'xtool')
const xtoolLauncher = () => join(paths.bin, 'xtool')

/**
 * The launcher, not an AppImage: extracting once means no FUSE (Ubuntu 24.04
 * ships without libfuse2) and no extraction on every call.
 */
export function xtoolLauncherScript(dir: string): string {
  return `#!/bin/sh\n# Written by circon setup: xtool's AppImage, extracted so it needs no FUSE.\nexec "${dir}/AppRun" "$@"\n`
}

const loggedIn = (output: string) => /^Logged in/m.test(output)

/** Ours by absolute path, so a setup run with a bare PATH still finds it. */
async function xtoolCommand(): Promise<string | null> {
  return existsSync(xtoolLauncher()) ? xtoolLauncher() : which('xtool')
}

async function installXtool(): Promise<void> {
  const arch = appImageArch()
  if (!arch) throw new Error(`xtool has no build for ${process.arch}`)
  const dir = xtoolDir()
  const r = await sh(
    `set -e
     tmp="$(mktemp -d)"
     curl -fL --retry 3 --progress-bar -o "$tmp/xtool.AppImage" ${JSON.stringify(xtoolDownloadUrl(PINNED.xtool, arch))}
     chmod +x "$tmp/xtool.AppImage"
     (cd "$tmp" && ./xtool.AppImage --appimage-extract > /dev/null)
     rm -rf ${JSON.stringify(dir)}
     mkdir -p ${JSON.stringify(paths.share)}
     mv "$tmp/squashfs-root" ${JSON.stringify(dir)}
     rm -rf "$tmp"`,
    { stream: true },
  )
  if (!r.ok) throw new Error(`xtool download failed (exit ${r.code})`)
  mkdirSync(paths.bin, { recursive: true })
  writeFileSync(xtoolLauncher(), xtoolLauncherScript(dir))
  chmodSync(xtoolLauncher(), 0o755)
}

/** Logs in when a key is configured and xtool is not logged in yet. */
async function logInXtool(cmd: string): Promise<void> {
  const key = appleKey()
  if (!key) return
  if (loggedIn((await run(cmd, ['auth', 'status'], { timeoutMs: 30_000 })).stdout)) return
  if (!existsSync(key.keyPath)) throw new Error(`the App Store Connect key ${key.keyPath} is gone — run 'circon config' again`)
  const r = await run(cmd, ['auth', 'login', '--mode', 'key'], { input: xtoolLoginInput(key), timeoutMs: 120_000 })
  if (!loggedIn(r.stdout)) {
    const why = `${r.stdout}\n${r.stderr}`.trim().split('\n').at(-1) ?? ''
    throw new Error(`xtool did not accept the App Store Connect key: ${why}`)
  }
}

/**
 * xtool signs the dev client and WebDriverAgent for the phone on this runner's
 * cable, registering the device and creating the profile itself. So the
 * Codemagic dev-client build is unsigned and never needs a phone's UDID, and
 * adding a phone means plugging it in.
 *
 * It only signs and installs here. It also builds SwiftPM apps from an iOS SDK
 * extracted from Xcode, which an Expo app cannot use and a runner never needs.
 */
export const xtoolComponent: Component = {
  id: 'xtool',
  summary: 'xtool (signs and installs iOS apps on a USB iPhone)',
  platforms: ['linux'],
  requires: ['ios-device'],

  async check() {
    const cmd = await xtoolCommand()
    if (!cmd) return missing('not installed')
    const version = await versionOf(cmd, ['--version'], /xtool (\d+\.\d+\.\d+)/)
    if (!version) return missing(`${cmd} does not run`)
    if (cmd !== xtoolLauncher()) return foreign(`xtool ${version} at ${cmd}`)
    if (version !== PINNED.xtool) return outdated(`xtool ${version}, pinned ${PINNED.xtool}`)
    if (loggedIn((await run(cmd, ['auth', 'status'], { timeoutMs: 30_000 })).stdout)) return ok(`xtool ${version}, logged in`)
    // Logging in is part of install, so a configured key makes this 'missing'.
    // Without one there is nothing setup can do; the iOS gate says what to add.
    return appleKey()
      ? missing(`xtool ${version}, not logged in yet`)
      : ok(`xtool ${version}, not logged in (an App Store Connect key from 'circon config' is needed for iosRunnerMode=device)`)
  },

  async install() {
    const current = existsSync(xtoolLauncher())
      ? await versionOf(xtoolLauncher(), ['--version'], /xtool (\d+\.\d+\.\d+)/)
      : null
    if (current !== PINNED.xtool) await installXtool()
    await logInXtool(xtoolLauncher())
  },

  async upgrade() {
    await installXtool()
    await logInXtool(xtoolLauncher())
  },
}

/** One directory per version, so the iOS gate picks the app up without being told the version. */
const wdaRoot = () => join(paths.share, 'webdriveragent')
const wdaApp = (version: string) => join(wdaRoot(), version, 'WebDriverAgentRunner-Runner.app')

/**
 * Appium's unsigned real-device build of WebDriverAgent, the piece that reads
 * the accessibility tree on the phone. It used to be built and signed on a Mac
 * by hand; now the runner downloads it and the iOS gate has xtool sign it.
 */
export const webDriverAgentComponent: Component = {
  id: 'webdriveragent',
  summary: 'WebDriverAgent (reads the accessibility tree on a USB iPhone)',
  platforms: ['linux'],
  requires: ['xtool'],

  async check() {
    if (existsSync(join(wdaApp(PINNED.webDriverAgent), 'Info.plist'))) return ok(`WebDriverAgent ${PINNED.webDriverAgent}`)
    const present = existsSync(wdaRoot()) ? readdirSync(wdaRoot()) : []
    return present.length
      ? outdated(`WebDriverAgent ${present.join(', ')}, pinned ${PINNED.webDriverAgent}`)
      : missing('not downloaded')
  },

  async install() {
    const target = join(wdaRoot(), PINNED.webDriverAgent)
    const r = await sh(
      `set -e
       tmp="$(mktemp -d)"
       curl -fL --retry 3 --progress-bar -o "$tmp/wda.zip" ${JSON.stringify(webDriverAgentUrl(PINNED.webDriverAgent))}
       unzip -q -o "$tmp/wda.zip" -d "$tmp/out"
       rm -rf ${JSON.stringify(wdaRoot())}
       mkdir -p ${JSON.stringify(target)}
       mv "$tmp/out/WebDriverAgentRunner-Runner.app" ${JSON.stringify(target)}/
       rm -rf "$tmp"`,
      { stream: true },
    )
    if (!r.ok) throw new Error(`WebDriverAgent download failed (exit ${r.code})`)
  },

  async upgrade() {
    await webDriverAgentComponent.install()
  },
}
