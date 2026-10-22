// Expo configures the monorepo (workspace packages, hoisted node_modules) by
// itself; Uniwind adds Tailwind for HeroUI Native and must be the outermost wrapper.
const { getDefaultConfig } = require('expo/metro-config')
const { withUniwindConfig } = require('uniwind/metro')

const config = getDefaultConfig(__dirname)

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
})
