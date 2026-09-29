/**
 * Integration Tests — request validation on the remaining unvalidated routes
 * ==========================================================================
 * The conversation routes, GET /users/:id, PATCH /users/me/push-token and
 * GET /disputes?status took raw input straight into Prisma (a non-string
 * listingId or an unknown status enum surfaced as a 500). They now go through
 * Zod like every other route: malformed input is a 400 with the usual
 * { error: 'Validation failed.', issues } body. Stripe payout onboarding now
 * also requires a verified account.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, createTestListing, getTestPrisma, disconnectTestPrisma, getApp } from './setup'

let user: { id: string; token: string }
let owner: { id: string; token: string }
let conversationId: string
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Renter' })
  owner = await createTestUser({ firstName: 'Owner' })
  listingId = (await createTestListing(owner.id)).id
  conversationId = (await getTestPrisma().conversation.create({ data: { listingId, renterId: user.id, ownerId: owner.id } })).id
})

after(async () => {
  await disconnectTestPrisma()
})

const as = (token: string) => ({
  get: (path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string) => supertest(getApp()).post(path).set('Authorization', `Bearer ${token}`),
  patch: (path: string) => supertest(getApp()).patch(path).set('Authorization', `Bearer ${token}`),
})

function assertValidationError(res: supertest.Response) {
  assert.equal(res.status, 400, JSON.stringify(res.body))
  assert.equal(res.body.error, 'Validation failed.')
}

describe('conversation routes', () => {
  test('POST /conversations needs a listingId string (an object was a 500)', async () => {
    assertValidationError(await as(user.token).post('/conversations').send({ listingId: { not: 'a string' } }))
    assertValidationError(await as(user.token).post('/conversations').send({}))
    assert.equal((await as(user.token).post('/conversations').send({ listingId })).status, 201)
  })

  test('conversation ids and the message cursor must be UUIDs', async () => {
    assertValidationError(await as(user.token).get('/conversations/not-a-uuid'))
    assertValidationError(await as(user.token).get('/conversations/not-a-uuid/messages'))
    assertValidationError(await as(user.token).get(`/conversations/${conversationId}/messages?after=not-a-uuid`))
    assertValidationError(await as(user.token).post('/conversations/not-a-uuid/read'))

    assert.equal((await as(user.token).get(`/conversations/${conversationId}`)).status, 200)
    assert.equal((await as(user.token).get(`/conversations/${conversationId}/messages`)).status, 200)
    assert.equal((await as(user.token).post(`/conversations/${conversationId}/read`)).status, 204)
  })
})

describe('user routes', () => {
  test('GET /users/:id needs a UUID', async () => {
    assertValidationError(await as(user.token).get('/users/not-a-uuid'))
    assert.equal((await as(user.token).get(`/users/${owner.id}`)).status, 200)
  })

  test('PATCH /users/me/push-token takes a bounded string or null', async () => {
    assertValidationError(await as(user.token).patch('/users/me/push-token').send({ expoPushToken: 'x'.repeat(5000) }))
    assertValidationError(await as(user.token).patch('/users/me/push-token').send({ expoPushToken: 42 }))
    assert.equal((await as(user.token).patch('/users/me/push-token').send({ expoPushToken: 'ExponentPushToken[abc123]' })).status, 200)
    assert.equal((await as(user.token).patch('/users/me/push-token').send({ expoPushToken: null })).status, 200)
  })

  test('Stripe payout onboarding requires a verified account', async () => {
    await getTestPrisma().user.update({ where: { id: user.id }, data: { verificationStatus: 'PENDING' } })
    const res = await as(user.token).post('/users/me/stripe-connect/onboard')
    assert.equal(res.status, 403)
  })
})

describe('dispute routes', () => {
  test('GET /disputes?status must be a known status (an unknown one was a 500)', async () => {
    assertValidationError(await as(user.token).get('/disputes?status=BOGUS'))
    assert.equal((await as(user.token).get('/disputes?status=OPEN')).status, 200)
    assert.equal((await as(user.token).get('/disputes')).status, 200)
  })
})
