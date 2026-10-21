// Stands in for Node's `assert` in the app bundle (see metro.config.js). The
// only thing in the bundle that imports it is @ide/backoff (expo-notifications'
// retry delays), which calls assert(condition, message). The browserify
// polyfill and the util chain it drags in were ~158 KB of the bundle for that.
function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion failed')
}
assert.ok = assert

module.exports = assert
