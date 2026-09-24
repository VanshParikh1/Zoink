/**
 * Integration Tests — App Review demo account seed
 * =================================================
 * Runs scripts/seedReviewerAccount against zoink_test and walks the paths App
 * Review will exercise: login, browse, inbox, bookings, reaching payment, and
 * Settings → Delete account (after which a re-run must restore the account).
 */

import './setup'
import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, getTestPrisma, disconnectTestPrisma, getApp, checkStripeConnectivity } from './setup'
import { seedReviewerAccount, DEFAULT_REVIEWER_EMAIL, OWNER_EMAIL } from '../scripts/seedReviewerAccount'
import * as blockService from '../services/blockService'
import { CURRENT_TERMS_VERSION } from '../config/legal'

const PASSWORD = 'Correct-Horse-Battery-9'
const seed = () => seedReviewerAccount({ reviewerEmail: DEFAULT_REVIEWER_EMAIL, reviewerPassword: PASSWORD })

let stripeAvailable = false

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
})

after(async () => {
  await disconnectTestPrisma()
})

async function login(email = DEFAULT_REVIEWER_EMAIL, password = PASSWORD) {
  return supertest(getApp()).post('/auth/login').send({ email, password })
}

describe('seedReviewerAccount', () => {
  test('rejects a weak password', async () => {
    await assert.rejects(seedReviewerAccount({ reviewerEmail: DEFAULT_REVIEWER_EMAIL, reviewerPassword: 'short' }), /at least 12/)
  })

  test('is idempotent — a second run creates no duplicates', async () => {
    const first = await seed()
    const second = await seed()
    const db = getTestPrisma()

    assert.equal(second.reviewer.id, first.reviewer.id)
    assert.deepEqual(second.bookings, first.bookings)
    assert.deepEqual(second.listingIds, first.listingIds)
    assert.equal(await db.user.count(), 3)
    assert.equal(await db.listing.count(), 4)
    assert.equal(await db.booking.count(), 3)
    assert.equal(await db.conversation.count(), 4)
    assert.equal(await db.listingImage.count(), 7)
    const messages = await db.message.count()
    await seed()
    assert.equal(await db.message.count(), messages)
  })

  test('reviewer is VERIFIED with current terms accepted and can log in', async () => {
    await seed()
    const user = await getTestPrisma().user.findUniqueOrThrow({ where: { email: DEFAULT_REVIEWER_EMAIL } })
    assert.equal(user.verificationStatus, 'VERIFIED')
    assert.equal(user.termsVersion, CURRENT_TERMS_VERSION)
    assert.ok(user.ageAttestedAt)

    const res = await login()
    assert.equal(res.status, 200)
    assert.ok(res.body.token)
    assert.equal(res.body.user.verificationStatus, 'VERIFIED')
  })

  test('re-running with a new password rotates it', async () => {
    await seed()
    await seedReviewerAccount({ reviewerEmail: DEFAULT_REVIEWER_EMAIL, reviewerPassword: 'Another-Strong-Pass-42' })
    assert.equal((await login()).status, 401)
    assert.equal((await login(DEFAULT_REVIEWER_EMAIL, 'Another-Strong-Pass-42')).status, 200)
  })

  test('the seeded owner cannot log in with anything guessable', async () => {
    await seed()
    assert.equal((await login(OWNER_EMAIL, PASSWORD)).status, 401)
  })

  test('home feed, inbox and bookings are populated for the reviewer', async () => {
    const result = await seed()
    const token = (await login()).body.token
    const app = getApp()

    const listings = await supertest(app).get('/listings').set('Authorization', `Bearer ${token}`)
    assert.equal(listings.status, 200)
    assert.equal(listings.body.items.length, 4)
    assert.ok(listings.body.items.every((l: any) => l.images.length > 0))

    const inbox = await supertest(app).get('/conversations/me').set('Authorization', `Bearer ${token}`)
    assert.equal(inbox.status, 200)
    assert.equal(inbox.body.length, 4)

    const bookings = await supertest(app).get('/bookings/me').set('Authorization', `Bearer ${token}`)
    assert.equal(bookings.status, 200)
    const statuses = bookings.body.map((b: any) => b.status).sort()
    assert.deepEqual(statuses, ['ACCEPTED', 'COMPLETED', 'PICKUP_PENDING'])

    const pickup = bookings.body.find((b: any) => b.id === result.bookings.pickupPending)
    assert.equal(pickup.pickupPhotos.length, 2)
  })

  test('the accepted booking can create a payment intent (Pay screen)', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe test API unreachable')
    const result = await seed()
    const token = (await login()).body.token

    const res = await supertest(getApp())
      .post(`/bookings/${result.bookings.accepted}/payment-intent`)
      .set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.ok(res.body.paymentClientSecret)
  })

  test('re-running clears blocks among seeded accounts', async () => {
    const result = await seed()
    await blockService.blockUser(result.reviewer.id, result.owner.id)
    await seed()
    assert.equal(await blockService.isBlockedBetween(result.reviewer.id, result.owner.id), false)
  })

  test('after Settings → Delete account, a re-run creates a fresh working reviewer', async () => {
    const first = await seed()
    const token = (await login()).body.token

    const del = await supertest(getApp()).delete('/users/me').set('Authorization', `Bearer ${token}`)
    assert.equal(del.status, 204)
    assert.equal((await login()).status, 401)

    const second = await seed()
    assert.notEqual(second.reviewer.id, first.reviewer.id)
    assert.equal((await login()).status, 200)

    const bookings = await supertest(getApp())
      .get('/bookings/me')
      .set('Authorization', `Bearer ${(await login()).body.token}`)
    assert.equal(bookings.body.length, 3)
  })
})
