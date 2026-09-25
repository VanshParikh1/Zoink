const { getDefaultConfig } = require('expo/metro-config')
const { withSentryFeedbackResolver, withSentryResolver } = require('@sentry/react-native/metro')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [monorepoRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true

// Import .svg files as React components via react-native-svg-transformer.
// Use the /expo entry so it chains through Expo's default Metro transformer.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
}
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
}

// @sentry/react-native pulls in the browser SDK's Session Replay and
// user-feedback packages, which Zoink doesn't enable (see Sentry.init in
// App.tsx). These are the SDK's own includeWebReplay / includeWebFeedback
// switches: those packages resolve to empty modules instead of shipping.
module.exports = withSentryFeedbackResolver(withSentryResolver(config, false), false)
