import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeJwtPayload, endsCurrentSession, isJwtExpired } from './sessionToken'

function jwt(payload: object) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`
}

test('decodes a JWT payload, including base64url without padding', () => {
  const payload = decodeJwtPayload(jwt({ userId: 'u1', firstName: 'Zoë', exp: 2_000_000_000 }))
  assert.equal(payload?.userId, 'u1')
  assert.equal(payload?.exp, 2_000_000_000)
})

test('anything that is not a JWT decodes to null', () => {
  assert.equal(decodeJwtPayload('demo-token'), null)
  assert.equal(decodeJwtPayload('a.%%%.c'), null)
  assert.equal(decodeJwtPayload(''), null)
})

test('a token is expired once exp has passed', () => {
  const now = Date.UTC(2026, 9, 18, 12)
  assert.equal(isJwtExpired({ exp: now / 1000 - 1 }, now), true)
  assert.equal(isJwtExpired({ exp: now / 1000 }, now), true)
  assert.equal(isJwtExpired({ exp: now / 1000 + 60 }, now), false)
  assert.equal(isJwtExpired({}, now), false, 'no exp: the server decides')
})

test('only a 401 for the current token ends the session', () => {
  assert.equal(endsCurrentSession(401, 'Bearer t1', 't1'), true, 'expired or deleted account')
  assert.equal(endsCurrentSession(401, undefined, null), false, 'wrong password at login sends no token')
  assert.equal(endsCurrentSession(401, 'Bearer old', 'new'), false, 'a request from before a fresh login')
  assert.equal(endsCurrentSession(401, 'Bearer t1', null), false, 'already signed out')
  assert.equal(endsCurrentSession(403, 'Bearer t1', 't1'), false, 'forbidden is not signed out')
  assert.equal(endsCurrentSession(503, 'Bearer t1', 't1'), false, 'an outage must not sign anyone out')
})
