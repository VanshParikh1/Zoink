import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDemoMode } from './demoModeGate'

test('demo mode needs a dev build and the exact flag', () => {
  assert.equal(resolveDemoMode(true, 'true'), true)
  assert.equal(resolveDemoMode(true, 'false'), false)
  assert.equal(resolveDemoMode(true, 'TRUE'), false)
  assert.equal(resolveDemoMode(true, undefined), false)
})

test('a release build never enables demo mode, whatever the env says', () => {
  assert.equal(resolveDemoMode(false, 'true'), false)
  assert.equal(resolveDemoMode(false, undefined), false)
})

// The mock modules are required inline (so Metro can drop them from release
// bundles); each of those requires must carry the same __DEV__ guard.
test('every mock-module require is behind __DEV__', () => {
  const dir = join(__dirname, '..', 'services')
  const offenders: string[] = []
  let guarded = 0
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('mock'))) {
    const source = readFileSync(join(dir, file), 'utf8')
    for (const match of source.matchAll(/\(([^()]*)\?\s*require\('\.\/mock\w+'\)/g)) {
      if (/__DEV__ &&/.test(match[1])) guarded += 1
      else offenders.push(`${file}: ${match[1].trim()}`)
    }
  }
  assert.deepEqual(offenders, [])
  assert.ok(guarded > 0, 'expected to find the mock requires')
})
