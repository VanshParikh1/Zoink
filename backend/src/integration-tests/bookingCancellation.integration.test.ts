/**
 * Integration Tests — Booking Cancellation Fee Rules
 * ====================================================
 * Tests the cancellation path at every relevant lifecycle stage and verifies
 * that the correct payment behaviour fires for each stage.
 *
 * Fee rules implemented in bookingService.handleCancellationPayment():
 *
 *   Stage at cancellation | Payment action
 *   ─────────────────────────────────────────────────────────────────────
 *   PENDING / ACCEPTED    | No PaymentIntent has ever been authorized at these
 *                         |   stages — payment now only happens at the
 *                         |   ACCEPTED -> CONFIRMED step (see paymentService.ts /
 *                         |   bookingService.createPaymentIntentForBooking).
 *                         |   handleCancellationPayment skips Stripe entirely
 *                         |   and paymentStatus is left untouched.
 *   CONFIRMED              | cancellation fees are disabled for launch (product
 *                         |   decision — see calculateCancellationFeeCents() in
 *                         |   bookingService.ts): cancelPaymentIntent() →
 *                         |   paymentStatus = REFUND_PENDING. The tiered clamp
 *                         |   ($5, $25, totalPrice × 5%) logic is retained but
 *                         |   unreachable until a future owner opt-in feature
 *                         |   re-enables it — see the skipped tests below,
 *                         |   which assert that behavior.
 *   PICKUP_PENDING        | not exercised here (cancellation from PICKUP_PENDING
 *                         | falls through with no Stripe call — its status
 *                         | doesn't match any branch in handleCancellationPayment)
 *
 * We poll the DB briefly after the transition to assert the payment status
 * change (handleCancellationPayment is now awaited end-to-end, but Stripe's
 * own async webhook delivery can still land the *next* status update, e.g.
 * REFUND_PENDING → REFUNDED, after this call returns).
 *
 * IMPORTANT: These tests call the real Stripe API for PaymentIntent creation
 * when STRIPE_SECRET_KEY is set. The payment status assertions accommodate
 * both the mock (Stripe absent) and live Stripe paths.
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
import { PaymentStatus, BookingStatus, Prisma } from '@prisma/client'

// ── Module-level state ────────────────────────────────────────────────────────
let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  const listing = await createTestListing(owner.id, { dailyPrice: 20, itemValue: 100 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Set owner's stripeAccountId to a real Stripe Connect test account so
 *  transitionBookingStatus's live accounts.retrieve() call succeeds instead
 *  of rejecting for missing/invalid Stripe Connect setup. */
async function giveOwnerStripeAccount(ownerId: string) {
  const accountId = process.env.DEV_STRIPE_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'DEV_STRIPE_ACCOUNT_ID is not set in .env.test — required for cancellation ' +
      'integration tests, which call the real Stripe Connect API. Set it to a real, ' +
      'fully-onboarded (payouts_enabled: true) Stripe Express test-mode account id.'
    )
  }
  const db = getTestPrisma()
  await db.user.update({
    where: { id: ownerId },
    data: { stripeAccountId: accountId },
  })
}

/** Poll the DB up to `maxMs` milliseconds until paymentStatus changes from
 *  the initial value. handleCancellationPayment is fire-and-forget so the
 *  status update may arrive a tick after transitionBookingStatus returns. */
async function waitForPaymentStatus(
  bookingId: string,
  notStatus: PaymentStatus,
  maxMs = 3000
): Promise<PaymentStatus> {
  const db = getTestPrisma()
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
    if (b.paymentStatus !== notStatus) return b.paymentStatus
    await new Promise(r => setTimeout(r, 100))
  }
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
  return b.paymentStatus
}

/** Calculate the expected cancellation fee cents used by the service.
 *  Mirrors calculateCancellationFeeCents() from bookingService.ts. */
function expectedCancellationFeeCents(totalPrice: number): number {
  const fee = Math.min(25, Math.max(5, totalPrice * 0.05))
  return Math.round(fee * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cancel from PENDING — no fee, payment intent voided
// ─────────────────────────────────────────────────────────────────────────────
describe('cancel from PENDING status', () => {
  test('renter can cancel a PENDING booking — no Stripe call, no payment intent exists yet', async () => {
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    assert.equal(booking.stripePaymentIntentId, null)

    const cancelled = await bookingService.transitionBookingStatus(
      booking.id, renter.id, BookingStatus.CANCELLED
    )

    assert.equal(cancelled.status, BookingStatus.CANCELLED)

    // createBooking no longer creates a PaymentIntent, so there's nothing for
    // Stripe to release — handleCancellationPayment's PENDING/ACCEPTED branch
    // is a pure no-op, and paymentStatus stays at its untouched default.
    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.paymentStatus, PaymentStatus.PENDING_AUTH)
    assert.equal(persisted.stripePaymentIntentId, null)
  })

  test('owner can cancel a PENDING booking', async () => {
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const cancelled = await bookingService.transitionBookingStatus(
      booking.id, owner.id, BookingStatus.CANCELLED
    )
    assert.equal(cancelled.status, BookingStatus.CANCELLED)
  })

  test('booking is persisted as CANCELLED in the DB', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    await bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED)

    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.CANCELLED)
  })

  test('STATUS_CHANGE booking event is recorded on cancellation', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    await bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED)

    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const cancelEvent = events.find(
      (e: any) => e.type === 'STATUS_CHANGE' && (e.metadata as any)?.to === 'CANCELLED'
    )
    assert.ok(cancelEvent, 'Should record a STATUS_CHANGE event with to=CANCELLED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 1b. Cancel from ACCEPTED — still unpaid, same no-Stripe-call behavior as PENDING
// ─────────────────────────────────────────────────────────────────────────────
describe('cancel from ACCEPTED status — no payment yet', () => {
  test('cancelling an ACCEPTED-but-unpaid booking makes no Stripe call', async () => {
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const accepted = await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
    assert.equal(accepted.stripePaymentIntentId, null, 'no payment intent should exist before the Pay step')

    const cancelled = await bookingService.transitionBookingStatus(accepted.id, renter.id, BookingStatus.CANCELLED)
    assert.equal(cancelled.status, BookingStatus.CANCELLED)

    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.paymentStatus, PaymentStatus.PENDING_AUTH, 'paymentStatus should be untouched — nothing was ever authorized')
  })

  test('auto-rejected overlapping requests do not revive when the accepted booking is later cancelled', async () => {
    await giveOwnerStripeAccount(owner.id)
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(5, 3)
    const renter2 = await createTestUser({ email: `renter2_revive_${Date.now()}@test.com` })

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

    await bookingService.transitionBookingStatus(b1.id, owner.id, BookingStatus.ACCEPTED)
    const declinedB2 = await db.booking.findUniqueOrThrow({ where: { id: b2.id } })
    assert.equal(declinedB2.status, BookingStatus.DECLINED, 'sanity check: b2 was auto-rejected by accepting b1')

    await bookingService.transitionBookingStatus(b1.id, owner.id, BookingStatus.CANCELLED)

    const b2AfterCancel = await db.booking.findUniqueOrThrow({ where: { id: b2.id } })
    assert.equal(b2AfterCancel.status, BookingStatus.DECLINED, 'auto-rejected booking must stay DECLINED, not revive to PENDING')
  })
})

/** Create, accept, pay, and directly confirm a booking with the given daily
 *  price / duration — CONFIRMED is where the paid-cancellation fee logic
 *  now lives (it used to be keyed on ACCEPTED, before ACCEPTED stopped
 *  implying payment). The payment intent is created for real (via
 *  createPaymentIntentForBooking, same as the Pay screen would call) so the
 *  fee tests below exercise a real Stripe capture/cancel; only the final
 *  ACCEPTED -> CONFIRMED status flip is a direct write, since re-driving
 *  ensureNoOverlap/notifications through that transition isn't the point here. */
async function makeConfirmedBooking(dailyPrice: number, durationDays: number) {
  // Recreate listing with the desired price for this test
  const pricedListing = await createTestListing(owner.id, { dailyPrice, itemValue: 100 })
  await giveOwnerStripeAccount(owner.id)

  const { startDate, endDate } = futureDates(3, durationDays)
  const booking = await bookingService.createBooking(renter.id, {
    listingId: pricedListing.id,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  })

  const accepted = await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
  const withIntent = await bookingService.createPaymentIntentForBooking(accepted.id, renter.id)

  const db = getTestPrisma()
  await db.booking.update({
    where: { id: withIntent.id },
    data: { status: BookingStatus.CONFIRMED, paymentStatus: PaymentStatus.AUTHORIZED, version: { increment: 1 } },
  })

  const confirmed = await bookingService.getBookingById(withIntent.id, renter.id)
  return { booking: confirmed, totalPrice: dailyPrice * durationDays }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cancel from CONFIRMED — cancellation fee charged (5% of total, $5–$25)
//    NOTE: fees are disabled for launch (see below) — these tests assert the
//    tiered fee math and are skipped until the opt-in feature re-enables it.
// ─────────────────────────────────────────────────────────────────────────────
describe('cancel from CONFIRMED status — cancellation fee applies', () => {
  const FEES_DISABLED_SKIP_REASON =
    'Cancellation fees disabled for launch — see calculateCancellationFeeCents() ' +
    'in bookingService.ts. Re-enable when the owner opt-in cancellation-fee ' +
    'feature ships.'

  test(
    'cancellation fee is clamped to $5 minimum (cheap short rental)',
    { skip: FEES_DISABLED_SKIP_REASON },
    async () => {
      // $5/day × 1 day = $5 total → 5% = $0.25 → clamped to $5 minimum
      const { booking, totalPrice } = await makeConfirmedBooking(5, 1)
      assert.equal(totalPrice, 5)
      const expected = expectedCancellationFeeCents(totalPrice)
      assert.equal(expected, 500, 'Minimum fee should be $5 = 500 cents')

      await bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED)

      const finalStatus = await waitForPaymentStatus(booking.id, PaymentStatus.AUTHORIZED)
      const acceptableStatuses: PaymentStatus[] = [PaymentStatus.CAPTURE_PENDING, PaymentStatus.CAPTURED]
      assert.ok(
        acceptableStatuses.includes(finalStatus),
        `Expected CAPTURE_PENDING or CAPTURED after ACCEPTED cancellation, got: ${finalStatus}`
      )
    }
  )

  test(
    'cancellation fee is clamped to $25 maximum (expensive rental)',
    { skip: FEES_DISABLED_SKIP_REASON },
    async () => {
      // $200/day × 3 days = $600 total → 5% = $30 → clamped to $25 maximum
      const { booking, totalPrice } = await makeConfirmedBooking(200, 3)
      assert.equal(totalPrice, 600)
      const expected = expectedCancellationFeeCents(totalPrice)
      assert.equal(expected, 2500, 'Maximum fee should be $25 = 2500 cents')

      await bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED)

      const finalStatus = await waitForPaymentStatus(booking.id, PaymentStatus.AUTHORIZED)
      const acceptableStatuses: PaymentStatus[] = [PaymentStatus.CAPTURE_PENDING, PaymentStatus.CAPTURED]
      assert.ok(
        acceptableStatuses.includes(finalStatus),
        `Expected CAPTURE_PENDING or CAPTURED after ACCEPTED cancellation, got: ${finalStatus}`
      )
    }
  )

  test(
    'cancellation fee is 5% for a mid-range rental ($100 total → $5 fee)',
    { skip: FEES_DISABLED_SKIP_REASON },
    async () => {
      // $20/day × 5 days = $100 total → 5% = $5 → exactly at the minimum
      const { booking, totalPrice } = await makeConfirmedBooking(20, 5)
      assert.equal(totalPrice, 100)
      const expected = expectedCancellationFeeCents(totalPrice)
      assert.equal(expected, 500, '$100 × 5% = $5 = 500 cents')

      await bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED)

      const finalStatus = await waitForPaymentStatus(booking.id, PaymentStatus.AUTHORIZED)
      const acceptableStatuses: PaymentStatus[] = [PaymentStatus.CAPTURE_PENDING, PaymentStatus.CAPTURED]
      assert.ok(
        acceptableStatuses.includes(finalStatus),
        `Expected CAPTURE_PENDING or CAPTURED after ACCEPTED cancellation, got: ${finalStatus}`
      )
    }
  )

  test('booking status is CANCELLED in DB after owner cancels a CONFIRMED booking', async () => {
    const db = getTestPrisma()
    const { booking } = await makeConfirmedBooking(20, 2)

    await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.CANCELLED)

    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.CANCELLED)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2b. Cancel from ACCEPTED — fees disabled for launch (current behavior)
//     No cancellation fee is charged regardless of rental value: the payment
//     intent is fully released (cancelPaymentIntent), same as the PENDING
//     branch, instead of a partial capture. See calculateCancellationFeeCents()
//     in bookingService.ts.
// ─────────────────────────────────────────────────────────────────────────────
describe('cancel from CONFIRMED status — fees disabled for launch', () => {
  async function assertNoFeeCharged(dailyPrice: number, durationDays: number) {
    const { booking } = await makeConfirmedBooking(dailyPrice, durationDays)

    await bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED)

    // With fees disabled, the ACCEPTED branch now takes the same full-release
    // path as PENDING cancellation (REFUND_PENDING → eventually REFUNDED),
    // never CAPTURE_PENDING/CAPTURED — that would mean a fee was captured.
    const finalStatus = await waitForPaymentStatus(booking.id, PaymentStatus.AUTHORIZED)
    const acceptableStatuses: PaymentStatus[] = [PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED]
    assert.ok(
      acceptableStatuses.includes(finalStatus),
      `Expected REFUND_PENDING or REFUNDED (no fee charged) after ACCEPTED ` +
      `cancellation, got: ${finalStatus}`
    )
  }

  test('cheap short rental ($5 total) is cancelled with no fee', async () => {
    await assertNoFeeCharged(5, 1)
  })

  test('expensive rental ($600 total) is cancelled with no fee', async () => {
    await assertNoFeeCharged(200, 3)
  })

  test('mid-range rental ($100 total) is cancelled with no fee', async () => {
    await assertNoFeeCharged(20, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cancel from PICKUP_PENDING — valid transition, behaves like ACCEPTED
// ─────────────────────────────────────────────────────────────────────────────
describe('cancel from PICKUP_PENDING status', () => {
  test('booking in PICKUP_PENDING can be cancelled and transitions correctly', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(3, 2)

    // Set up pre-condition directly: booking already in PICKUP_PENDING
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(40),
        depositAmount: new Prisma.Decimal(12),
        commissionAmount: new Prisma.Decimal(6),
        ownerPayout: new Prisma.Decimal(34),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.PICKUP_PENDING,
        paymentStatus: PaymentStatus.AUTHORIZED,
        stripePaymentIntentId: `pi_mock_pickup_${Date.now()}`,
        pickupPhotos: [
          'https://res.cloudinary.com/test/image/upload/p1.jpg',
          'https://res.cloudinary.com/test/image/upload/p2.jpg',
        ],
        handoffInitiatedAt: new Date(),
      },
    })

    const cancelled = await bookingService.transitionBookingStatus(
      booking.id, renter.id, BookingStatus.CANCELLED
    )
    assert.equal(cancelled.status, BookingStatus.CANCELLED)

    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.CANCELLED)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Invalid cancellations — state machine enforcement
// ─────────────────────────────────────────────────────────────────────────────
describe('invalid cancellation attempts', () => {
  test('cannot cancel a COMPLETED booking', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(3, 2)

    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(40),
        depositAmount: new Prisma.Decimal(12),
        commissionAmount: new Prisma.Decimal(6),
        ownerPayout: new Prisma.Decimal(34),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        completedAt: new Date(),
      },
    })

    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED),
      /BOOKING_INVALID_TRANSITION/
    )
  })

  test('cannot cancel a DECLINED booking', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(3, 2)

    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(40),
        depositAmount: new Prisma.Decimal(12),
        commissionAmount: new Prisma.Decimal(6),
        ownerPayout: new Prisma.Decimal(34),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.DECLINED,
        paymentStatus: PaymentStatus.REFUNDED,
      },
    })

    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED),
      /BOOKING_INVALID_TRANSITION/
    )
  })

  test('cannot cancel a booking that belongs to a different user', async () => {
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const stranger = await createTestUser()
    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, stranger.id, BookingStatus.CANCELLED),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cancellation via HTTP (supertest) — exercises the full controller stack
// ─────────────────────────────────────────────────────────────────────────────
describe('cancellation via HTTP', () => {
  test('PATCH /bookings/:id/cancel returns 200 for renter on PENDING booking', async () => {
    const app = getApp()
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    assert.equal(createRes.status, 201)

    const cancelRes = await supertest(app)
      .patch(`/bookings/${createRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(cancelRes.status, 200, `Expected 200, got ${cancelRes.status}: ${JSON.stringify(cancelRes.body)}`)
    assert.equal(cancelRes.body.status, 'CANCELLED')
  })

  test('PATCH /bookings/:id/cancel returns 401 without auth token', async () => {
    const app = getApp()
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    const cancelRes = await supertest(app)
      .patch(`/bookings/${createRes.body.id}/cancel`)
    // No Authorization header

    assert.equal(cancelRes.status, 401)
  })

  test('PATCH /bookings/:id/cancel returns 403 for unrelated user', async () => {
    const app = getApp()
    const stranger = await createTestUser({ email: `stranger_${Date.now()}@test.com` })
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    const cancelRes = await supertest(app)
      .patch(`/bookings/${createRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${stranger.token}`)

    assert.equal(cancelRes.status, 403)
  })

  test('PATCH /bookings/:id/cancel returns 404 for non-existent booking id', async () => {
    const app = getApp()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const res = await supertest(app)
      .patch(`/bookings/${fakeId}/cancel`)
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(res.status, 404)
  })
})
