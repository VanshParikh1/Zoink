/**
 * Integration Tests — App Review demo account seed
 * =================================================
 * Runs scripts/seedReviewerAccount against zoink_test and walks the paths App
 * Review will exercise: login, browse, inbox, bookings, reaching payment, and
 * Settings → Delete account (after which a re-run must restore the account).
 * A re-run must also put a paid or tapped demo booking back to its start.
 */

import './setup'
import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, getTestPrisma, disconnectTestPrisma, getApp, checkStripeConnectivity } from './setup'
import {
  seedReviewerAccount,
  seedStripeClient,
  DEFAULT_REVIEWER_EMAIL,
  DEFAULT_DELETION_REVIEWER_EMAIL,
  OWNER_EMAIL,
  RECORDING_EMAIL,
  RECORDING_DELETE_EMAIL,
  recordingSeedOptions,
  SeedStripe,
} from '../scripts/seedReviewerAccount'
import * as blockService from '../services/blockService'
import { CURRENT_TERMS_VERSION } from '../config/legal'

const PASSWORD = 'Correct-Horse-Battery-9'
const DELETION_PASSWORD = 'Staple-Battery-Horse-7'
const opts = (reviewerPassword = PASSWORD) => ({
  reviewerEmail: DEFAULT_REVIEWER_EMAIL,
  reviewerPassword,
  deletionReviewerPassword: DELETION_PASSWORD,
})
const seed = (stripe: SeedStripe | null = null) => seedReviewerAccount(opts(), undefined, stripe)

/** Records what the reset asks of Stripe; intents not listed are "missing". */
function fakeStripe(statuses: Record<string, string>) {
  const calls: string[] = []
  const stripe: SeedStripe = {
    paymentIntents: {
      async retrieve(id) {
        if (!statuses[id]) throw Object.assign(new Error('No such payment_intent'), { code: 'resource_missing' })
        return { status: statuses[id], amount_received: statuses[id] === 'succeeded' ? 1000 : 0 }
      },
      async cancel(id) {
        calls.push(`cancel ${id}`)
      },
    },
    refunds: {
      async create({ payment_intent }) {
        calls.push(`refund ${payment_intent}`)
      },
    },
  }
  return { stripe, calls }
}

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
    await assert.rejects(seedReviewerAccount(opts('short'), undefined, null), /REVIEWER_PASSWORD must be at least 12/)
    await assert.rejects(
      seedReviewerAccount({ ...opts(), deletionReviewerPassword: 'short' }, undefined, null),
      /DELETION_REVIEWER_PASSWORD must be at least 12/,
    )
  })

  test('refuses a live Stripe key, and needs none locally', () => {
    assert.throws(() => seedStripeClient('sk_live_abc'), /live Stripe key/)
    assert.equal(seedStripeClient(''), null)
    assert.ok(seedStripeClient('sk_test_abc'))
  })

  test('is idempotent — a second run creates no duplicates', async () => {
    const first = await seed()
    const second = await seed()
    const db = getTestPrisma()

    assert.equal(second.reviewer.id, first.reviewer.id)
    assert.equal(second.deletionReviewer.id, first.deletionReviewer.id)
    assert.equal(second.bookings.completed, first.bookings.completed)
    assert.deepEqual(second.listingIds, first.listingIds)
    assert.equal(await db.user.count(), 4)
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
    await seedReviewerAccount(opts('Another-Strong-Pass-42'), undefined, null)
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

  test('a paid Pay booking is reset: its intents are cancelled or refunded and it is ACCEPTED and unpaid again', async () => {
    const first = await seed()
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: first.bookings.accepted },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'AUTHORIZED',
        depositStatus: 'AUTHORIZED',
        stripePaymentIntentId: 'pi_rent_held',
        stripeDepositPaymentIntentId: 'pi_deposit_captured',
      },
    })
    await db.bookingEvent.create({ data: { bookingId: first.bookings.accepted, type: 'STATUS_CHANGE', metadata: { to: 'CONFIRMED' } } })

    const { stripe, calls } = fakeStripe({ pi_rent_held: 'requires_capture', pi_deposit_captured: 'succeeded' })
    const second = await seed(stripe)

    assert.deepEqual(calls, ['cancel pi_rent_held', 'refund pi_deposit_captured'])
    assert.equal(await db.booking.count({ where: { id: first.bookings.accepted } }), 0)
    const fresh = await db.booking.findUniqueOrThrow({ where: { id: second.bookings.accepted } })
    assert.equal(fresh.status, 'ACCEPTED')
    assert.equal(fresh.paymentStatus, 'PENDING_AUTH')
    assert.equal(fresh.depositStatus, null)
    assert.equal(fresh.stripePaymentIntentId, null)
    assert.equal(fresh.stripeDepositPaymentIntentId, null)
    assert.equal(await db.bookingEvent.count({ where: { bookingId: second.bookings.accepted } }), 0)
    assert.equal(await db.booking.count(), 3)
  })

  test('the reviewer can tap Zoink It, and a re-run puts the pickup back untapped', async () => {
    const first = await seed()
    const token = (await login()).body.token
    const tap = await supertest(getApp())
      .post(`/bookings/${first.bookings.pickupPending}/pickup/confirm`)
      .set('Authorization', `Bearer ${token}`)
    assert.equal(tap.status, 200, JSON.stringify(tap.body))
    const db = getTestPrisma()
    assert.ok((await db.booking.findUniqueOrThrow({ where: { id: first.bookings.pickupPending } })).renterPickupTappedAt)

    // Even if the handoff had gone through, a re-run restores it.
    await db.booking.update({ where: { id: first.bookings.pickupPending }, data: { status: 'ACTIVE', stripePaymentIntentId: 'pi_mock_local' } })
    const { stripe, calls } = fakeStripe({})
    const second = await seed(stripe)

    assert.deepEqual(calls, [])
    const fresh = await db.booking.findUniqueOrThrow({ where: { id: second.bookings.pickupPending } })
    assert.equal(fresh.status, 'PICKUP_PENDING')
    assert.equal(fresh.renterPickupTappedAt, null)
    assert.equal(fresh.ownerPickupTappedAt, null)
    assert.equal(fresh.pickupPhotos.length, 2)
  })

  test('the deletion account can log in and delete itself, and a re-run brings it back', async () => {
    const first = await seed()
    const user = await getTestPrisma().user.findUniqueOrThrow({ where: { email: DEFAULT_DELETION_REVIEWER_EMAIL } })
    assert.equal(user.verificationStatus, 'VERIFIED')
    assert.equal(user.termsVersion, CURRENT_TERMS_VERSION)

    const token = (await login(DEFAULT_DELETION_REVIEWER_EMAIL, DELETION_PASSWORD)).body.token
    const del = await supertest(getApp()).delete('/users/me').set('Authorization', `Bearer ${token}`)
    assert.equal(del.status, 204, JSON.stringify(del.body))
    assert.equal((await login(DEFAULT_DELETION_REVIEWER_EMAIL, DELETION_PASSWORD)).status, 401)

    const second = await seed()
    assert.notEqual(second.deletionReviewer.id, first.deletionReviewer.id)
    assert.equal((await login(DEFAULT_DELETION_REVIEWER_EMAIL, DELETION_PASSWORD)).status, 200)
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

describe('recording cast (--recording)', () => {
  const REC_PASSWORD = 'Recording-Pass-Strong-1'
  const REC_DELETE_PASSWORD = 'Recording-Delete-Pass-2'
  const seedRecording = (stripe: SeedStripe | null = null) =>
    seedReviewerAccount(recordingSeedOptions(REC_PASSWORD, REC_DELETE_PASSWORD), undefined, stripe)

  test('seeds its own cast: no user, listing, booking or chat shared with the reviewer cast', async () => {
    const reviewer = await seed()
    const recording = await seedRecording()
    assert.equal(recording.reviewer.email, RECORDING_EMAIL)
    assert.equal(recording.deletionReviewer.email, RECORDING_DELETE_EMAIL)
    const reviewerIds = [reviewer.reviewer, reviewer.deletionReviewer, reviewer.owner, reviewer.secondUser].map((u) => u.id)
    for (const u of [recording.reviewer, recording.deletionReviewer, recording.owner, recording.secondUser]) {
      assert.ok(!reviewerIds.includes(u.id))
    }
    assert.equal(recording.listingIds.filter((id) => reviewer.listingIds.includes(id)).length, 0)

    const db = getTestPrisma()
    assert.equal(await db.user.count(), 8)
    assert.equal(await db.booking.count(), 6)
    assert.equal(await db.conversation.count(), 8)

    const res = await login(RECORDING_EMAIL, REC_PASSWORD)
    assert.equal(res.status, 200)
    const bookings = await supertest(getApp()).get('/bookings/me').set('Authorization', `Bearer ${res.body.token}`)
    assert.deepEqual(bookings.body.map((b: any) => b.status).sort(), ['ACCEPTED', 'COMPLETED', 'PICKUP_PENDING'])
  })

  test('re-seeding or deleting the recording cast leaves the reviewer cast untouched', async () => {
    const reviewer = await seed()
    const db = getTestPrisma()
    const snapshot = async () => ({
      users: await db.user.findMany({ where: { id: { in: [reviewer.reviewer.id, reviewer.deletionReviewer.id] } }, orderBy: { id: 'asc' } }),
      bookings: await db.booking.findMany({ where: { renterId: reviewer.reviewer.id }, orderBy: { id: 'asc' } }),
      listings: await db.listing.findMany({ where: { ownerId: reviewer.owner.id }, include: { images: true }, orderBy: { id: 'asc' } }),
      messages: await db.message.count({ where: { conversation: { renterId: reviewer.reviewer.id } } }),
    })
    const before = await snapshot()

    const first = await seedRecording()
    // Pay and tap on the recording side, then re-seed it with a Stripe reset.
    await db.booking.update({ where: { id: first.bookings.accepted }, data: { status: 'CONFIRMED', stripePaymentIntentId: 'pi_rec' } })
    const { stripe, calls } = fakeStripe({ pi_rec: 'requires_capture' })
    await seedRecording(stripe)
    assert.deepEqual(calls, ['cancel pi_rec'])

    const token = (await login(RECORDING_DELETE_EMAIL, REC_DELETE_PASSWORD)).body.token
    const del = await supertest(getApp()).delete('/users/me').set('Authorization', `Bearer ${token}`)
    assert.equal(del.status, 204, JSON.stringify(del.body))

    assert.deepEqual(await snapshot(), before)
  })
})
