/**
 * Integration Tests — per-user limits on write actions
 * ===================================================
 * Actions that notify another user or cost something per call have their own
 * per-user caps on top of the global limiter:
 *   messages 60/min · booking requests 20/hour · reports 10/day ·
 *   disputes 10/day · uploads 30/hour (shared) · block/unblock 30/hour (shared)
 *
 * The limiter runs before validation, so these tests exhaust each budget
 * with cheap invalid requests (400s still count) and then expect a 429.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  getTestPrisma,
  disconnectTestPrisma,
  getApp,
} from './setup'

let user: { id: string; token: string }
let other: { id: string; token: string }
let listingId: string
let conversationId: string

beforeEach(async () => {
  await truncateAllTables()
  user = await createTestUser({ firstName: 'Busy' })
  other = await createTestUser({ firstName: 'Other' })
  listingId = (await createTestListing(user.id)).id
  conversationId = (
    await getTestPrisma().conversation.create({ data: { listingId, renterId: other.id, ownerId: user.id } })
  ).id
})

after(async () => {
  await disconnectTestPrisma()
})

type Call = (token: string) => supertest.Test

async function exhaust(call: Call, token: string, limit: number) {
  for (let i = 0; i < limit; i++) {
    const res = await call(token)
    assert.notEqual(res.status, 429, `call ${i + 1} of ${limit} should be allowed`)
  }
  const blocked = await call(token)
  assert.equal(blocked.status, 429, `call ${limit + 1} should be rate limited`)
  assert.equal(blocked.body.error, 'Too many requests. Please try again later.')
}

const app = () => supertest(getApp())

describe('per-user write limits', () => {
  test('messages: 60 per minute', async () => {
    const send: Call = (token) =>
      app().post(`/conversations/${conversationId}/messages`).set('Authorization', `Bearer ${token}`).send({ body: 42 })
    await exhaust(send, user.token, 60)

    const otherUser = await app()
      .post(`/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ body: 'still fine' })
    assert.equal(otherUser.status, 201, 'another user has their own budget')
  })

  test('booking requests: 20 per hour', async () => {
    const request: Call = (token) => app().post('/bookings').set('Authorization', `Bearer ${token}`).send({})
    await exhaust(request, other.token, 20)
  })

  test('reports and disputes: 10 per day each, counted separately', async () => {
    const report: Call = (token) => app().post('/reports').set('Authorization', `Bearer ${token}`).send({})
    const dispute: Call = (token) => app().post('/disputes').set('Authorization', `Bearer ${token}`).send({})

    await exhaust(report, user.token, 10)
    const firstDispute = await dispute(user.token)
    assert.equal(firstDispute.status, 400, 'reports and disputes have separate budgets')
    await exhaust(dispute, user.token, 9)
  })

  test('uploads: 30 per hour, shared across avatar, listing and handoff photos', async () => {
    const avatar: Call = (token) => app().post('/users/me/avatar').set('Authorization', `Bearer ${token}`)
    await exhaust(avatar, user.token, 30)

    const listingPhoto = await app().post(`/listings/${listingId}/images`).set('Authorization', `Bearer ${user.token}`)
    assert.equal(listingPhoto.status, 429, 'listing photo uploads draw from the same budget')
  })

  test('block/unblock: 30 per hour, shared', async () => {
    let flip = false
    const toggle: Call = (token) => {
      flip = !flip
      const req = flip ? app().post(`/users/${other.id}/block`) : app().delete(`/users/${other.id}/block`)
      return req.set('Authorization', `Bearer ${token}`)
    }
    await exhaust(toggle, user.token, 30)
  })
})
