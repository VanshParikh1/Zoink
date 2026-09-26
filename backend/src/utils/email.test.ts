import test from 'node:test'
import assert from 'node:assert/strict'
import { hasPlusInLocalPart, normalizeEmail } from './email'

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Alice.Smith@Mail.UToronto.ca \n'), 'alice.smith@mail.utoronto.ca')
  assert.equal(normalizeEmail('bob@x.ca'), 'bob@x.ca')
})

test('hasPlusInLocalPart looks only at the part before the last @', () => {
  assert.equal(hasPlusInLocalPart('alice+zoink@mail.utoronto.ca'), true)
  assert.equal(hasPlusInLocalPart('+alice@mail.utoronto.ca'), true)
  assert.equal(hasPlusInLocalPart('alice@mail+x.utoronto.ca'), false)
  assert.equal(hasPlusInLocalPart('alice@mail.utoronto.ca'), false)
  assert.equal(hasPlusInLocalPart('no-at-sign+x'), false)
})
