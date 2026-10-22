import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { run, sh, which, versionOf } from '../core/exec.ts'
import { type Component, ok, missing } from './types.ts'

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
 * go-ios installs and launches the dev-client build and runs WebDriverAgent,
 * which exposes the accessibility hierarchy the gate asserts on.
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
