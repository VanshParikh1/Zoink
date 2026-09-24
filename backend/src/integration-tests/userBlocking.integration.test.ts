/**
 * Integration Tests — User Blocking
 * ==================================
 * Blocking is symmetric in effect: if A blocks B, neither sees the other's
 * listings or profile, and neither can message or book the other. Each rule
 * is checked from both sides (A = blocker, B = blocked).
 */

import './setup'
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
import * as blockService from '../services/blockService'
import * as listingService from '../services/listingService'
import * as userService from '../services/userService'
import * as conversationService from '../services/conversationService'
import * as bookingService from '../services/bookingService'

type TestUser = { id: string; email: string; token: string }

let blocker: TestUser
let blocked: TestUser
let bystander: TestUser
let blockerListingId: string
let blockedListingId: string
let bystanderListingId: string

function daysFromNow(days: number) {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

async function assertStatus(promise: Promise<unknown>, statusCode: number) {
  await assert.rejects(promise, (err: any) => {
    assert.equal(err.statusCode, statusCode)
    return true
  })
}

beforeEach(async () => {
  await truncateAllTables()
  blocker = await createTestUser({ firstName: 'Blocker' })
  blocked = await createTestUser({ firstName: 'Blocked' })
  bystander = await createTestUser({ firstName: 'Bystander' })
  blockerListingId = (await createTestListing(blocker.id, { title: 'Blocker Drill' })).id
  blockedListingId = (await createTestListing(blocked.id, { title: 'Blocked Tent' })).id
  bystanderListingId = (await createTestListing(bystander.id, { title: 'Bystander Camera' })).id
})

after(async () => {
  await disconnectTestPrisma()
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. Block / unblock / list
// ─────────────────────────────────────────────────────────────────────────────
describe('block endpoints', () => {
  test('POST /users/:id/block blocks, and is idempotent', async () => {
    const app = getApp()
    for (let i = 0; i < 2; i++) {
      const res = await supertest(app)
        .post(`/users/${blocked.id}/block`)
        .set('Authorization', `Bearer ${blocker.token}`)
      assert.equal(res.status, 204)
    }
    const rows = await getTestPrisma().userBlock.findMany({ where: { blockerId: blocker.id } })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].blockedId, blocked.id)
  })

  test('a user cannot block themselves', async () => {
    const res = await supertest(getApp())
      .post(`/users/${blocker.id}/block`)
      .set('Authorization', `Bearer ${blocker.token}`)
    assert.equal(res.status, 400)
  })

  test('blocking a nonexistent user is a 404', async () => {
    const res = await supertest(getApp())
      .post('/users/00000000-0000-4000-8000-000000000000/block')
      .set('Authorization', `Bearer ${blocker.token}`)
    assert.equal(res.status, 404)
  })

  test('a non-uuid id is rejected by validation', async () => {
    const res = await supertest(getApp())
      .post('/users/not-a-uuid/block')
      .set('Authorization', `Bearer ${blocker.token}`)
    assert.equal(res.status, 400)
  })

  test('GET /users/me/blocks lists only the caller\'s blocks', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const app = getApp()

    const mine = await supertest(app).get('/users/me/blocks').set('Authorization', `Bearer ${blocker.token}`)
    assert.equal(mine.status, 200)
    assert.equal(mine.body.length, 1)
    assert.equal(mine.body[0].id, blocked.id)
    assert.equal(mine.body[0].firstName, 'Blocked')
    assert.ok(mine.body[0].blockedAt)

    // The blocked side is never told.
    const theirs = await supertest(app).get('/users/me/blocks').set('Authorization', `Bearer ${blocked.token}`)
    assert.deepEqual(theirs.body, [])
  })

  test('DELETE /users/:id/block unblocks, and is idempotent', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const app = getApp()
    for (let i = 0; i < 2; i++) {
      const res = await supertest(app)
        .delete(`/users/${blocked.id}/block`)
        .set('Authorization', `Bearer ${blocker.token}`)
      assert.equal(res.status, 204)
    }
    assert.equal(await blockService.isBlockedBetween(blocker.id, blocked.id), false)
  })

  test('the blocked user cannot lift a block by calling DELETE on the blocker', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    await supertest(getApp())
      .delete(`/users/${blocker.id}/block`)
      .set('Authorization', `Bearer ${blocked.token}`)
    assert.equal(await blockService.isBlockedBetween(blocker.id, blocked.id), true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Listings — browse/search feed + detail
// ─────────────────────────────────────────────────────────────────────────────
describe('listing visibility', () => {
  test('browse excludes the other side\'s listings in both directions', async () => {
    await blockService.blockUser(blocker.id, blocked.id)

    const forBlocker = await listingService.browseListings({ viewerId: blocker.id })
    const blockerIds = forBlocker.items.map((l) => l.id)
    assert.ok(!blockerIds.includes(blockedListingId))
    assert.ok(blockerIds.includes(bystanderListingId))
    assert.equal(forBlocker.meta.total, 2) // own + bystander

    const forBlocked = await listingService.browseListings({ viewerId: blocked.id })
    const blockedIds = forBlocked.items.map((l) => l.id)
    assert.ok(!blockedIds.includes(blockerListingId))
    assert.ok(blockedIds.includes(bystanderListingId))
  })

  test('text search also excludes blocked owners', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const res = await supertest(getApp())
      .get('/listings')
      .query({ q: 'Tent' })
      .set('Authorization', `Bearer ${blocker.token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.items.length, 0)
  })

  test('browse is unaffected for a bystander and after unblocking', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const forBystander = await listingService.browseListings({ viewerId: bystander.id })
    assert.equal(forBystander.meta.total, 3)

    await blockService.unblockUser(blocker.id, blocked.id)
    const forBlocker = await listingService.browseListings({ viewerId: blocker.id })
    assert.equal(forBlocker.meta.total, 3)
  })

  test('listing detail 404s across a block, both directions', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const app = getApp()

    const a = await supertest(app).get(`/listings/${blockedListingId}`).set('Authorization', `Bearer ${blocker.token}`)
    assert.equal(a.status, 404)
    const b = await supertest(app).get(`/listings/${blockerListingId}`).set('Authorization', `Bearer ${blocked.token}`)
    assert.equal(b.status, 404)

    const own = await listingService.getListingById(blockerListingId, blocker.id)
    assert.equal(own.id, blockerListingId)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Public profile
// ─────────────────────────────────────────────────────────────────────────────
describe('public profile', () => {
  test('profile 404s across a block, both directions', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const app = getApp()

    const a = await supertest(app).get(`/users/${blocked.id}`).set('Authorization', `Bearer ${blocker.token}`)
    assert.equal(a.status, 404)
    const b = await supertest(app).get(`/users/${blocker.id}`).set('Authorization', `Bearer ${blocked.token}`)
    assert.equal(b.status, 404)

    const bystanderView = await userService.getPublicProfile(blocked.id, bystander.id)
    assert.equal(bystanderView.id, blocked.id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Conversations
// ─────────────────────────────────────────────────────────────────────────────
describe('conversations', () => {
  test('neither side can open a new conversation across a block', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    await assertStatus(conversationService.openConversation(blocker.id, blockedListingId), 403)
    await assertStatus(conversationService.openConversation(blocked.id, blockerListingId), 403)
  })

  test('neither side can send into an existing thread after a block', async () => {
    const convo = await conversationService.openConversation(blocked.id, blockerListingId)
    await conversationService.sendMessage(blocked.id, convo.id, 'Is the drill free Saturday?')

    await blockService.blockUser(blocker.id, blocked.id)
    await assertStatus(conversationService.sendMessage(blocked.id, convo.id, 'hello?'), 403)
    await assertStatus(conversationService.sendMessage(blocker.id, convo.id, 'no'), 403)

    const count = await getTestPrisma().message.count({ where: { conversationId: convo.id } })
    assert.equal(count, 1)
  })

  test('existing threads drop out of both inboxes, and come back on unblock', async () => {
    const blockedConvo = await conversationService.openConversation(blocked.id, blockerListingId)
    const bystanderConvo = await conversationService.openConversation(bystander.id, blockerListingId)

    await blockService.blockUser(blocker.id, blocked.id)
    const blockerInbox = (await conversationService.getMyConversations(blocker.id)).map((c) => c.id)
    assert.deepEqual(blockerInbox, [bystanderConvo.id])
    assert.deepEqual(await conversationService.getMyConversations(blocked.id), [])

    await blockService.unblockUser(blocker.id, blocked.id)
    const restored = (await conversationService.getMyConversations(blocker.id)).map((c) => c.id)
    assert.ok(restored.includes(blockedConvo.id))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Bookings
// ─────────────────────────────────────────────────────────────────────────────
describe('bookings', () => {
  test('neither side can request a booking across a block', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const dates = { startDate: daysFromNow(3), endDate: daysFromNow(5) }

    await assertStatus(bookingService.createBooking(blocker.id, { listingId: blockedListingId, ...dates }), 403)
    await assertStatus(bookingService.createBooking(blocked.id, { listingId: blockerListingId, ...dates }), 403)

    const count = await getTestPrisma().booking.count()
    assert.equal(count, 0)
  })

  test('POST /bookings returns 403 across a block', async () => {
    await blockService.blockUser(blocker.id, blocked.id)
    const res = await supertest(getApp())
      .post('/bookings')
      .set('Authorization', `Bearer ${blocked.token}`)
      .send({ listingId: blockerListingId, startDate: daysFromNow(3).toISOString(), endDate: daysFromNow(5).toISOString() })
    assert.equal(res.status, 403)
  })
})
