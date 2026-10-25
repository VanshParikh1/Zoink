// Stands in for react-native-reanimated's scripts/validate-worklets-version
// in release bundles only (see metro.config.js). Reanimated calls it only
// under __DEV__ (NativeReanimated / JSReanimated constructors), but its module
// is imported at the top level either way, which shipped semver (~42 KB of
// source) in every release bundle for a check that never runs there.
module.exports = function validateWorkletsVersion() {
  return { ok: true }
}
