/**
 * Integration Tests — session tokens must be HS256
 * ================================================
 * jwt.verify with only a secret accepts any HMAC algorithm (HS256/384/512).
 * Tokens are only ever issued as HS256, so verification is pinned to it:
 * anything else is rejected as an invalid session.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import jwt from 'jsonwebtoken'
import { truncateAllTables, createTestUser, disconnectTestPrisma, getApp } from './setup'
import { signJWT } from '../services/authService'

let user: { id: string; email: string; token: string }

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Jwt' })
})

after(async () => {
  await disconnectTestPrisma()
})

const me = (token: string) => supertest(getApp()).get('/users/me').set('Authorization', `Bearer ${token}`)

describe('JWT algorithm pinning', () => {
  test('tokens issued by the app are HS256 and accepted', async () => {
    const token = signJWT(user.id, 'VERIFIED', user.email, 'Jwt', 'USER', null, null)
    assert.equal(jwt.decode(token, { complete: true })?.header.alg, 'HS256')
    assert.equal((await me(token)).status, 200)
  })

  for (const algorithm of ['HS384', 'HS512'] as const) {
    test(`a ${algorithm} token signed with the real secret is rejected`, async () => {
      const token = jwt.sign({ userId: user.id, verificationStatus: 'VERIFIED', role: 'USER' }, process.env.JWT_SECRET!, { algorithm, expiresIn: '1h' })
      const res = await me(token)
      assert.equal(res.status, 401)
      assert.deepEqual(res.body, { error: 'Invalid or expired token.' })
    })
  }
})
