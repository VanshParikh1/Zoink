/**
 * Integration Tests — client errors are 4xx, infrastructure errors are 503
 * =======================================================================
 * Bad client input (malformed JSON, a non-image or oversized upload, a
 * malformed URL encoding) used to fall through to the generic 500 handler and
 * page Sentry. A database failure while checking the session returned 401,
 * which makes the app delete its stored token — logging users out over a
 * transient outage. Nothing here may echo internal error text.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, disconnectTestPrisma, getApp, getTestPrisma } from './setup'

let user: { id: string; token: string }

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Errors' })
})

after(async () => {
  await disconnectTestPrisma()
})

const app = () => supertest(getApp())

describe('client errors', () => {
  test('malformed JSON is a 400, not a 500', async () => {
    const res = await app().post('/auth/login').set('Content-Type', 'application/json').send('{"email": ')
    assert.equal(res.status, 400)
    assert.deepEqual(res.body, { error: 'Malformed JSON body.' })
  })

  test('a non-image avatar upload is a 400', async () => {
    const res = await app()
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('avatar', Buffer.from('not an image'), { filename: 'notes.txt', contentType: 'text/plain' })
    assert.equal(res.status, 400)
    assert.deepEqual(res.body, { error: 'Only image files are allowed.' })
  })

  test('an oversized avatar upload is a 413', async () => {
    const res = await app()
      .post('/users/me/avatar')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('avatar', Buffer.alloc(5 * 1024 * 1024 + 1, 1), { filename: 'huge.png', contentType: 'image/png' })
    assert.equal(res.status, 413)
    assert.deepEqual(res.body, { error: 'That file is too large.' })
  })

  test('a malformed percent-encoded path parameter is a 400', async () => {
    const res = await app().get('/listings/%E0%A4%A').set('Authorization', `Bearer ${user.token}`)
    assert.equal(res.status, 400)
    assert.deepEqual(res.body, { error: 'Bad request.' })
  })
})

describe('infrastructure errors', () => {
  test('a database failure while checking the session is a 503, not a 401', async () => {
    const prisma = getTestPrisma() as any
    const original = prisma.user.findUnique
    prisma.user.findUnique = async () => {
      throw new Error('Connection terminated unexpectedly')
    }
    try {
      const res = await app().get('/users/me').set('Authorization', `Bearer ${user.token}`)
      assert.equal(res.status, 503)
      assert.deepEqual(res.body, { error: 'Service temporarily unavailable. Please try again.' })
    } finally {
      prisma.user.findUnique = original
    }
  })

  test('an invalid token is still a 401', async () => {
    const res = await app().get('/users/me').set('Authorization', 'Bearer not-a-jwt')
    assert.equal(res.status, 401)
  })
})
