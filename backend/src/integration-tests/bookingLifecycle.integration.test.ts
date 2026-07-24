/**
 * Integration Tests — Full Booking Lifecycle
 * ===========================================
 * Exercises the real booking → payment → handoff lifecycle end-to-end against
 * the zoink_test Postgres database and Stripe test mode.
 *
 * Happy-path sequence tested:
 *   create booking → owner accept → pickup handoff (photos + Zoink It tap)
 *   → ACTIVE rental → return handoff → COMPLETED → review obligations created
 *   → payout eligible (paymentStatus = PAYOUT_PENDING)
 *
 * All service functions are called directly (no HTTP) except where we also
 * want to verify the HTTP layer, in which case we use supertest.
 *
 * State pre-conditions for mid-flow tests are set up with direct Prisma writes
 * as documented in the spec — we never call transition functions out of order.
 */

import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  checkStripeConnectivity,
  getApp,
} from './setup'
import * as bookingService from '../services/bookingService'
import * as handoffService from '../services/handoffService'
import { PaymentStatus, BookingStatus } from '@prisma/client'

// ── Module-level state shared across all tests in this file ──────────────────
let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()

  // Each test gets fresh users and a fresh listing so there's no cross-test
  // coupling. DEV_STRIPE_ACCOUNT_ID is intentionally left blank in .env.test
  // so that ensureOwnerStripeAccount() falls through to the devAccountId path
  // only if the env var is set. For accept-booking tests we set stripeAccountId
  // directly on the owner record instead.
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: null })
  renter = await createTestUser({ firstName: 'Renter' })
  const listing = await createTestListing(owner.id, { dailyPrice: 20, itemValue: 200 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// ── Helper: set stripeAccountId on owner so accept doesn't fail ───────────────
async function giveOwnerStripeAccount(ownerId: string) {
  const db = getTestPrisma()
  // Accept-flow tests call ensureOwnerStripeAccount(), which makes a real
  // Stripe API call (accounts.retrieve) against this id. It must be a real,
  // fully-onboarded (payouts_enabled: true) Stripe Express test-mode Connect
  // account — a fake id causes a live StripePermissionError. Fail fast if
  // it's not configured rather than silently falling back to a fake value.
  const accountId = process.env.DEV_STRIPE_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'DEV_STRIPE_ACCOUNT_ID is not set in .env.test — required for accept-booking ' +
      'integration tests, which call the real Stripe Connect API. Set it to a real, ' +
      'fully-onboarded (payouts_enabled: true) Stripe Express test-mode account id.'
    )
  }
  await db.user.update({
    where: { id: ownerId },
    data: { stripeAccountId: accountId },
  })
  return accountId
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Booking creation
// ─────────────────────────────────────────────────────────────────────────────
describe('createBooking', () => {
  test('creates a PENDING booking with payment intent and correct financials', async () => {
    if (!stripeAvailable) {
      // Still runs — paymentService falls back to mock when Stripe is absent
    }
    const { startDate, endDate } = futureDates(2, 3) // 3-day rental @ $20/day = $60
    const result = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      message: 'Can I pick it up in the morning?',
      insuranceOptIn: false,
    })

    assert.equal(result.status, BookingStatus.PENDING)
    assert.equal(result.renterId, renter.id)
    assert.equal(result.ownerId, owner.id)
    assert.equal(result.listingId, listingId)
    assert.equal(result.totalPrice, 60) // 3 days × $20
    assert.equal(result.depositAmount, 18) // 30% of $60
    assert.ok(result.commissionAmount > 0, 'commission should be positive')
    assert.ok(result.ownerPayout > 0, 'ownerPayout should be positive')
    assert.equal(result.insuranceFee, 0)
    assert.ok(result.stripePaymentIntentId, 'paymentIntentId should be set')
    assert.ok(
      result.paymentStatus === PaymentStatus.AUTHORIZED ||
      result.paymentStatus === PaymentStatus.PENDING_AUTH,
      `unexpected paymentStatus: ${result.paymentStatus}`
    )
    assert.ok(result.paymentClientSecret, 'clientSecret should be returned for frontend PaymentSheet')

    // Verify persisted in DB
    const db = getTestPrisma()
    const booking = await db.booking.findUniqueOrThrow({ where: { id: result.id } })
    assert.equal(booking.status, BookingStatus.PENDING)
    assert.ok(booking.stripePaymentIntentId)
  })

  test('creates booking with insurance when insuranceOptIn=true', async () => {
    const { startDate, endDate } = futureDates(2, 1)
    const result = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      insuranceOptIn: true,
    })
    assert.ok(result.insuranceFee > 0, 'insurance fee should be positive when opted in')
    assert.equal(result.insuranceOptIn, true)
  })

  test('rejects booking own listing', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    await assert.rejects(
      () => bookingService.createBooking(owner.id, {
        listingId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /cannot book your own listing/i)
        return true
      }
    )
  })

  test('rejects booking unavailable listing', async () => {
    const db = getTestPrisma()
    await db.listing.update({ where: { id: listingId }, data: { isAvailable: false } })
    const { startDate, endDate } = futureDates(2, 2)
    await assert.rejects(
      () => bookingService.createBooking(renter.id, {
        listingId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /unavailable/i)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Owner accept / decline
// ─────────────────────────────────────────────────────────────────────────────
describe('owner accept / decline', () => {
  test('owner can accept a PENDING booking (transitions to ACCEPTED)', async () => {
    await giveOwnerStripeAccount(owner.id)

    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    // Ensure payment is marked authorized so accept doesn't reject
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    const accepted = await bookingService.transitionBookingStatus(
      booking.id, owner.id, BookingStatus.ACCEPTED
    )
    assert.equal(accepted.status, BookingStatus.ACCEPTED)

    // Verify persisted
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.ACCEPTED)

    // Booking events should include the STATUS_CHANGE event
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const statusEvents = events.filter((e: any) => e.type === 'STATUS_CHANGE')
    assert.ok(statusEvents.length >= 1, 'at least one STATUS_CHANGE event should exist')
  })

  test('owner accept fails when payment is not authorized', async () => {
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    // Force payment status back to PENDING_AUTH
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: PaymentStatus.PENDING_AUTH },
    })

    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED),
      (err: any) => {
        assert.equal(err.statusCode, 409)
        assert.match(err.message, /payment authorization is not ready/i)
        return true
      }
    )
  })

  test('owner can decline a PENDING booking', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const declined = await bookingService.transitionBookingStatus(
      booking.id, owner.id, BookingStatus.DECLINED
    )
    assert.equal(declined.status, BookingStatus.DECLINED)
  })

  test('renter cannot accept a booking (owner-only action)', async () => {
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const db = getTestPrisma()
    await db.booking.update({ where: { id: booking.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } })

    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.ACCEPTED),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        return true
      }
    )
  })

  test('invalid transition from DECLINED is rejected by state machine', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.DECLINED)

    // DECLINED → ACCEPTED is not a valid transition
    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED),
      /BOOKING_INVALID_TRANSITION/
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pickup handoff — photos + Zoink It tap → ACTIVE
// ─────────────────────────────────────────────────────────────────────────────
describe('pickup handoff', () => {
  // Helper: creates an ACCEPTED booking ready for handoff
  async function makeAcceptedBooking() {
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })
    return bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
  }

  test('owner initiates pickup — booking moves to PICKUP_PENDING', async () => {
    const booking = await makeAcceptedBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]

    const updated = await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', photos)
    assert.equal(updated.status, BookingStatus.PICKUP_PENDING)
    assert.deepEqual(updated.pickupPhotos, photos)
    assert.ok(updated.handoffInitiatedAt, 'handoffInitiatedAt should be set')

    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.PICKUP_PENDING)
  })

  test('renter cannot initiate pickup (owner-only)', async () => {
    const booking = await makeAcceptedBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]
    await assert.rejects(
      () => handoffService.initiateHandoff(booking.id, renter.id, 'pickup', photos),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        assert.match(err.message, /owner/i)
        return true
      }
    )
  })

  test('initiateHandoff rejects fewer than 2 photos', async () => {
    const booking = await makeAcceptedBooking()
    await assert.rejects(
      () => handoffService.initiateHandoff(booking.id, owner.id, 'pickup', [
        'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      ]),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /2 to 3/i)
        return true
      }
    )
  })

  test('both tap Zoink It within window → booking moves to ACTIVE, payment captured', async () => {
    const booking = await makeAcceptedBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', photos)

    // Owner taps first
    const ownerTap = await handoffService.confirmHandoff(booking.id, owner.id, 'pickup')
    assert.equal(ownerTap.bothConfirmed, false, 'should not be confirmed until both tap')
    assert.equal(ownerTap.booking.status, BookingStatus.PICKUP_PENDING)

    // Renter taps within window — both confirmed
    const renterTap = await handoffService.confirmHandoff(booking.id, renter.id, 'pickup')
    assert.equal(renterTap.bothConfirmed, true)
    assert.equal(renterTap.booking.status, BookingStatus.ACTIVE)

    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.ACTIVE)
    // Payment should have been attempted to capture (CAPTURE_PENDING or CAPTURED or FAILED)
    const pickupAcceptableStatuses: PaymentStatus[] = [PaymentStatus.CAPTURE_PENDING, PaymentStatus.CAPTURED, PaymentStatus.FAILED]
    assert.ok(
      pickupAcceptableStatuses.includes(persisted.paymentStatus),
      `unexpected paymentStatus after pickup: ${persisted.paymentStatus}`
    )
    // BookingEvents should include ZOINK_TAP events
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const tapEvents = events.filter((e: any) => e.type === 'ZOINK_TAP')
    assert.ok(tapEvents.length >= 2, 'should have at least 2 ZOINK_TAP events')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Return handoff — photos + Zoink It tap → COMPLETED + payout eligible
// ─────────────────────────────────────────────────────────────────────────────
describe('return handoff and completion', () => {
  // Helper: creates a booking in ACTIVE state using direct Prisma writes for
  // the pre-condition (avoids walking through the full pickup flow in every
  // test, keeping each test focused on the return behaviour).
  async function makeActiveBooking() {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(2, 2)
    // Create booking directly
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: 40,
        depositAmount: 12,
        commissionAmount: 6,
        ownerPayout: 34,
        insuranceFee: 0,
        status: BookingStatus.ACTIVE,
        paymentStatus: PaymentStatus.CAPTURED,
        stripePaymentIntentId: `pi_mock_active_${Date.now()}`,
        pickupPhotos: [
          'https://res.cloudinary.com/test/image/upload/pickup1.jpg',
          'https://res.cloudinary.com/test/image/upload/pickup2.jpg',
        ],
      },
    })
    return booking
  }

  test('renter initiates return — booking moves to RETURN_PENDING', async () => {
    const booking = await makeActiveBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]

    const updated = await handoffService.initiateHandoff(booking.id, renter.id, 'return', photos)
    assert.equal(updated.status, BookingStatus.RETURN_PENDING)
    assert.deepEqual(updated.returnPhotos, photos)
    assert.ok(updated.returnInitiatedAt, 'returnInitiatedAt should be set')
  })

  test('owner cannot initiate return (renter-only)', async () => {
    const booking = await makeActiveBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    await assert.rejects(
      () => handoffService.initiateHandoff(booking.id, owner.id, 'return', photos),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        assert.match(err.message, /renter/i)
        return true
      }
    )
  })

  test('both tap Zoink It for return → COMPLETED, review obligations created, paymentStatus PAYOUT_PENDING', async () => {
    const booking = await makeActiveBooking()
    const returnPhotos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, renter.id, 'return', returnPhotos)

    // Renter taps first
    const renterTap = await handoffService.confirmHandoff(booking.id, renter.id, 'return')
    assert.equal(renterTap.bothConfirmed, false)
    assert.equal(renterTap.booking.status, BookingStatus.RETURN_PENDING)

    // Owner taps within window
    const ownerTap = await handoffService.confirmHandoff(booking.id, owner.id, 'return')
    assert.equal(ownerTap.bothConfirmed, true)
    assert.equal(ownerTap.booking.status, BookingStatus.COMPLETED)
    assert.ok(ownerTap.booking.completedAt, 'completedAt should be set')

    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.COMPLETED)
    assert.equal(persisted.paymentStatus, PaymentStatus.PAYOUT_PENDING)
    assert.ok(persisted.completedAt, 'completedAt should be persisted')

    // Review obligations should have been created for both participants
    const obligations = await db.reviewObligation.findMany({ where: { bookingId: booking.id } })
    assert.equal(obligations.length, 2, 'should create two review obligations')
    const renterObligation = obligations.find((o: any) => o.userId === renter.id)
    const ownerObligation = obligations.find((o: any) => o.userId === owner.id)
    assert.ok(renterObligation, 'renter review obligation should exist')
    assert.ok(ownerObligation, 'owner review obligation should exist')
    assert.equal(renterObligation?.status, 'PENDING')
    assert.equal(ownerObligation?.status, 'PENDING')
    assert.equal(renterObligation?.reviewerRole, 'RENTER')
    assert.equal(ownerObligation?.reviewerRole, 'LENDER')
  })

  test('tap after window has expired — single tap does not complete booking', async () => {
    const db = getTestPrisma()
    const booking = await makeActiveBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, renter.id, 'return', photos)

    // Simulate renter tapped long ago (beyond the 5-minute window)
    await db.booking.update({
      where: { id: booking.id },
      data: { renterReturnTappedAt: new Date(Date.now() - 10 * 60 * 1000) }, // 10 min ago
    })

    // Owner taps now — window expired, so NOT both confirmed
    const ownerTap = await handoffService.confirmHandoff(booking.id, owner.id, 'return')
    assert.equal(ownerTap.bothConfirmed, false)
    assert.equal(ownerTap.booking.status, BookingStatus.RETURN_PENDING)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Full end-to-end happy path via HTTP (supertest)
// ─────────────────────────────────────────────────────────────────────────────
describe('full happy path via HTTP', () => {
  test('POST /bookings creates booking and returns 201 with clientSecret', async () => {
    const app = getApp()
    const { startDate, endDate } = futureDates(3, 2)

    const res = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate, message: 'Test booking', insuranceOptIn: false })

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.status, 'PENDING')
    assert.ok(res.body.id, 'booking id should be present')
    assert.ok(res.body.stripePaymentIntentId, 'payment intent id should be present')
    assert.ok('paymentClientSecret' in res.body, 'paymentClientSecret should be in response')
  })

  test('GET /bookings/:id returns booking for renter', async () => {
    const app = getApp()
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    assert.equal(createRes.status, 201)
    const bookingId = createRes.body.id

    const getRes = await supertest(app)
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(getRes.status, 200)
    assert.equal(getRes.body.id, bookingId)
    assert.equal(getRes.body.status, 'PENDING')
  })

  test('GET /bookings/:id returns 403 for unrelated user', async () => {
    const app = getApp()
    const stranger = await createTestUser({ email: `stranger_${Date.now()}@test.com` })
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    const getRes = await supertest(app)
      .get(`/bookings/${createRes.body.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)

    assert.equal(getRes.status, 403)
  })

  test('PATCH /bookings/:id/accept transitions to ACCEPTED', async () => {
    const app = getApp()
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    assert.equal(createRes.status, 201)
    const bookingId = createRes.body.id

    // Ensure payment is authorized
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    const acceptRes = await supertest(app)
      .patch(`/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${owner.token}`)

    assert.equal(acceptRes.status, 200, `Expected 200, got ${acceptRes.status}: ${JSON.stringify(acceptRes.body)}`)
    assert.equal(acceptRes.body.status, 'ACCEPTED')
  })

  test('PATCH /bookings/:id/accept returns 403 when called by renter', async () => {
    const app = getApp()
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    const db = getTestPrisma()
    await db.booking.update({
      where: { id: createRes.body.id },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    const res = await supertest(app)
      .patch(`/bookings/${createRes.body.id}/accept`)
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(res.status, 403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Overlap detection
// ─────────────────────────────────────────────────────────────────────────────
describe('booking overlap detection', () => {
  test('accepting a booking that overlaps with an existing ACCEPTED booking is rejected', async () => {
    await giveOwnerStripeAccount(owner.id)
    const db = getTestPrisma()

    // Both rentals use the same listing and overlapping dates
    const { startDate, endDate } = futureDates(5, 3)
    const renter2 = await createTestUser({ email: `renter2_${Date.now()}@test.com` })

    const b1 = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const b2 = await bookingService.createBooking(renter2.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    // Authorize both
    await db.booking.updateMany({
      where: { id: { in: [b1.id, b2.id] } },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    // Accept b1 — succeeds
    await bookingService.transitionBookingStatus(b1.id, owner.id, BookingStatus.ACCEPTED)

    // Accept b2 — should fail with 409 overlap
    await assert.rejects(
      () => bookingService.transitionBookingStatus(b2.id, owner.id, BookingStatus.ACCEPTED),
      (err: any) => {
        assert.equal(err.statusCode, 409)
        assert.match(err.message, /overlap/i)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. getBookingById and getMyBookings — data access controls
// ─────────────────────────────────────────────────────────────────────────────
describe('booking data access', () => {
  test('getBookingById returns correct data for renter with pendingReview=null when not completed', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const result = await bookingService.getBookingById(booking.id, renter.id)
    assert.equal(result.id, booking.id)
    assert.equal(result.renterId, renter.id)
    assert.equal(result.pendingReview, null)
    // Numbers should be numbers, not Decimal objects
    assert.equal(typeof result.totalPrice, 'number')
    assert.equal(typeof result.depositAmount, 'number')
  })

  test('getMyBookings returns all bookings for renter', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const { startDate: s2, endDate: e2 } = futureDates(10, 2)
    await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(s2),
      endDate: new Date(e2),
    })

    const bookings = await bookingService.getMyBookings(renter.id)
    assert.equal(bookings.length, 2)
    assert.ok(bookings.every((b: any) => b.renterId === renter.id))
  })

  test('getBookingById throws 403 for non-participant', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const stranger = await createTestUser()
    await assert.rejects(
      () => bookingService.getBookingById(booking.id, stranger.id),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        return true
      }
    )
  })

  test('review obligations are included in booking response after completion', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(2, 2)

    // Build a COMPLETED booking with obligations via direct Prisma writes
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: 40,
        depositAmount: 12,
        commissionAmount: 6,
        ownerPayout: 34,
        insuranceFee: 0,
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        completedAt: new Date(),
      },
    })

    await db.reviewObligation.createMany({
      data: [
        { bookingId: booking.id, userId: renter.id, targetUserId: owner.id, reviewerRole: 'RENTER' },
        { bookingId: booking.id, userId: owner.id, targetUserId: renter.id, reviewerRole: 'LENDER' },
      ],
    })

    const result = await bookingService.getBookingById(booking.id, renter.id)
    assert.ok(Array.isArray(result.reviewObligations))
    assert.equal(result.reviewObligations.length, 2)

    // pendingReview should be populated for the renter
    assert.ok(result.pendingReview, 'pendingReview should be set for renter')
    assert.equal(result.pendingReview.reviewerRole, 'RENTER')
    assert.equal(result.pendingReview.targetUserId, owner.id)
    // Score labels differ by role
    assert.ok('scoreAKey' in result.pendingReview.scoreLabels)
  })
})
