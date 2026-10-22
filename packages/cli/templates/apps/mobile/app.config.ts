import type { ExpoConfig } from 'expo/config'

// Codemagic sets BUILD_NUMBER on every build; the stores need it to grow.
const build = Number(process.env['BUILD_NUMBER'] ?? 1)

const config: ExpoConfig = {
  name: '__PROJECT_NAME__',
  slug: '__PROJECT_NAME__',
  scheme: '__PROJECT_NAME__',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: '__BUNDLE_ID__',
    buildNumber: String(build),
    supportsTablet: true,
  },
  android: {
    package: '__BUNDLE_ID__',
    versionCode: build,
  },
  web: {
    bundler: 'metro',
    output: 'single',
  },
  plugins: ['expo-router', 'expo-secure-store', '@clerk/expo'],
  experiments: { typedRoutes: true },
}

export default config
