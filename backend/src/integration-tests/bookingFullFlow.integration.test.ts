/**
 * Integration Tests — Full New Booking Flow, End-to-End
 * ========================================================
 * Simulates the complete rebuilt booking flow against the real zoink_test
 * Postgres DB and Stripe test mode:
 *
 *   request (PENDING, no payment, price snapshotted, message -> Conversation)
 *   -> lender accepts (ACCEPTED; overlapping PENDING siblings auto-declined;
 *      dates NOT yet locked)
 *   -> borrower pays (PaymentIntent created from the snapshotted price)
 *   -> borrower confirms (CONFIRMED; dates NOW locked)
 *
 * Also covers the two cancellation regimes (no-Stripe pre-payment vs.
 * Stripe-backed post-payment) and the two DECLINED reason metadata values
 * (manual_decline vs overlap_auto_reject).
 *
 * Stripe calls in the "no Stripe call" assertions are verified with
 * mock.method() spies on paymentService (see adminController.test.ts /
 * disputeController.test.ts for the same pattern) rather than by inference
 * from paymentStatus alone — spying proves the function was never invoked at
 * all, not just that its result looks like a no-op would.
 */

import test, { before, beforeEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  checkStripeConnectivity,
} from './setup'
import * as bookingService from '../services/bookingService'
import * as paymentService from '../services/paymentService'
import * as conversationService from '../services/conversationService'
import { PaymentStatus, BookingStatus, Prisma } from '@prisma/client'

// ── Module-level state ────────────────────────────────────────────────────────
let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  mock.restoreAll()
  owner = await createTestUser({ firstName: 'Owner' })
  // $20/day, $15 flat deposit, no insurance opt-in used in these tests — keeps
  // the price snapshot ($100 total + $15 deposit = $115 = 11500 cents for a
  // 5-day D1-D5 rental) easy to hand-verify against Stripe's own record.
  const listing = await createTestListing(owner.id, { dailyPrice: 20, itemValue: 100, depositAmount: 15 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Set owner's stripeAccountId to a real Stripe Connect test account so
 *  transitionBookingStatus's live accounts.retrieve() call succeeds. */
async function giveOwnerStripeAccount(ownerId: string) {
  const accountId = process.env.DEV_STRIPE_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'DEV_STRIPE_ACCOUNT_ID is not set in .env.test — required for these ' +
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

function eventReasons(events: { metadata: unknown }[]) {
  return events.map((e: any) => (e.metadata as any)?.reason).filter(Boolean)
}

// ─────────────────────────────────────────────────────────────────────────────
// Full happy path — every status transition + the overlap auto-reject
// ─────────────────────────────────────────────────────────────────────────────
describe('full new booking flow, end-to-end', () => {
  test('request -> accept (with overlap auto-reject) -> pay (snapshotted price) -> confirm (dates lock)', async () => {
    await giveOwnerStripeAccount(owner.id)
    const db = getTestPrisma()

    const borrowerA = await createTestUser({ email: `borrowerA_${Date.now()}@test.com`, firstName: 'Alice' })
    const borrowerB = await createTestUser({ email: `borrowerB_${Date.now()}@test.com`, firstName: 'Bob' })
    const borrowerC = await createTestUser({ email: `borrowerC_${Date.now()}@test.com`, firstName: 'Cara' })
    const borrowerD = await createTestUser({ email: `borrowerD_${Date.now()}@test.com`, firstName: 'Dan' })

    // ── Step 1: Borrower A requests D1-D5 ──────────────────────────────────
    const { startDate: d1, endDate: d5 } = futureDates(5, 5) // 5-day rental, $20/day = $100
    const bookingA = await bookingService.createBooking(borrowerA.id, {
      listingId,
      startDate: new Date(d1),
      endDate: new Date(d5),
      message: 'Excited to borrow this!',
    })

    assert.equal(bookingA.status, BookingStatus.PENDING)
    assert.equal(bookingA.totalPrice, 100)
    assert.equal(bookingA.depositAmount, 15)
    assert.ok(bookingA.commissionAmount > 0)
    assert.ok(bookingA.ownerPayout > 0)

    assert.ok(bookingA.conversationId, 'booking should be linked to a Conversation')
    const conversationA = await db.conversation.findUniqueOrThrow({ where: { id: bookingA.conversationId! } })
    assert.equal(conversationA.listingId, listingId)
    assert.equal(conversationA.renterId, borrowerA.id)
    assert.equal(conversationA.ownerId, owner.id)

    const messagesA = await db.message.findMany({ where: { conversationId: bookingA.conversationId! } })
    assert.equal(messagesA.length, 1)
    assert.equal(messagesA[0].body, 'Excited to borrow this!')
    assert.equal(messagesA[0].senderId, borrowerA.id)

    // Booking.message no longer exists on the schema at all.
    const bookingColumns = await db.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings'
    `
    assert.ok(
      !bookingColumns.some((c) => c.column_name === 'message'),
      'bookings table should not have a message column anymore'
    )

    // ── Step 2: Borrower B requests overlapping D3-D7 — succeeds, no conflict ──
    const { startDate: d3, endDate: d7 } = futureDates(7, 5)
    const bookingB = await bookingService.createBooking(borrowerB.id, {
      listingId,
      startDate: new Date(d3),
      endDate: new Date(d7),
    })
    assert.equal(bookingB.status, BookingStatus.PENDING, 'two overlapping PENDING requests can coexist')

    // ── Step 3: Lender accepts A — B auto-rejected, dates NOT yet locked ──────
    const acceptedA = await bookingService.transitionBookingStatus(bookingA.id, owner.id, BookingStatus.ACCEPTED)
    assert.equal(acceptedA.status, BookingStatus.ACCEPTED)
    assert.equal(acceptedA.stripePaymentIntentId, null, 'no PaymentIntent should exist yet')

    const persistedB = await db.booking.findUniqueOrThrow({ where: { id: bookingB.id } })
    assert.equal(persistedB.status, BookingStatus.DECLINED, 'overlapping PENDING sibling should be auto-declined')

    const bEvents = await db.bookingEvent.findMany({ where: { bookingId: bookingB.id, type: 'STATUS_CHANGE' } })
    const bDeclineEvent = bEvents.find((e: any) => (e.metadata as any)?.to === 'DECLINED')
    assert.ok(bDeclineEvent)
    assert.equal((bDeclineEvent!.metadata as any).reason, 'overlap_auto_reject')

    // Trickiest invariant in the redesign: ACCEPTED does not lock dates.
    // Proof: a second, independent overlapping request can ALSO be accepted
    // while A is merely ACCEPTED (unpaid) — ensureNoOverlap only blocks on
    // CONFIRMED/ACTIVE, and the auto-reject on accepting A only touched B
    // (which was PENDING at the time), not any booking created afterward.
    const bookingC = await bookingService.createBooking(borrowerC.id, {
      listingId,
      startDate: new Date(d1),
      endDate: new Date(d5),
    })
    const acceptedC = await bookingService.transitionBookingStatus(bookingC.id, owner.id, BookingStatus.ACCEPTED)
    assert.equal(acceptedC.status, BookingStatus.ACCEPTED, 'accepting a second overlapping request must succeed — A being ACCEPTED does not reserve the dates')

    // ── Step 4: Borrower A pays — PaymentIntent uses the price snapshotted ──
    // at request time, not the current Listing price. Prove it by changing
    // the Listing's dailyPrice drastically *after* the booking was created,
    // then asserting the actual Stripe charge still matches the original
    // $100 + $15 deposit = $115 snapshot.
    await db.listing.update({ where: { id: listingId }, data: { dailyPrice: new Prisma.Decimal(999) } })

    const withIntent = await bookingService.createPaymentIntentForBooking(acceptedA.id, borrowerA.id)
    assert.ok(withIntent.stripePaymentIntentId)
    assert.ok(withIntent.paymentClientSecret)
    // The booking response itself still reflects the original snapshot —
    // recomputing from the (now $999/day) listing would give totalPrice 4995.
    assert.equal(withIntent.totalPrice, 100, 'totalPrice must stay the original snapshot, not recompute from the changed listing price')

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const paymentIntent = await stripe.paymentIntents.retrieve(withIntent.stripePaymentIntentId!)
      // toCents(100 totalPrice + 15 depositAmount + 0 insuranceFee) = 11500.
      // If this were wrongly recomputed from the changed $999/day listing,
      // it would be toCents(4995 + 15) = 501000 instead — nowhere close.
      assert.equal(paymentIntent.amount, 11500, 'Stripe should have been charged the ORIGINAL snapshotted amount, not a recomputed one')
    }

    // ── Step 5: Confirm payment — CONFIRMED, dates NOW lock ──────────────────
    await db.booking.update({ where: { id: withIntent.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } })
    const confirmedA = await bookingService.transitionBookingStatus(withIntent.id, borrowerA.id, BookingStatus.CONFIRMED)
    assert.equal(confirmedA.status, BookingStatus.CONFIRMED)

    // Now that A is CONFIRMED, a brand-new overlapping request CANNOT be accepted.
    const bookingD = await bookingService.createBooking(borrowerD.id, {
      listingId,
      startDate: new Date(d1),
      endDate: new Date(d5),
    })
    await assert.rejects(
      () => bookingService.transitionBookingStatus(bookingD.id, owner.id, BookingStatus.ACCEPTED),
      (err: any) => {
        assert.equal(err.statusCode, 409)
        assert.match(err.message, /overlap/i)
        return true
      }
    )

    // ── Step 6: the payment badge/banner trigger clears once CONFIRMED ──────
    const conversationsAfterConfirm = await conversationService.getMyConversations(borrowerA.id)
    const threadA = conversationsAfterConfirm.find((c) => c.id === bookingA.conversationId)
    assert.equal(threadA?.acceptedUnpaidBookingId, null, 'the Pay prompt must disappear once CONFIRMED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cancellation regimes — no-Stripe pre-payment vs. Stripe-backed post-payment
// ─────────────────────────────────────────────────────────────────────────────
describe('cancellation makes Stripe calls only once payment exists', () => {
  test('cancelling a PENDING booking makes no Stripe calls', async () => {
    const renter = await createTestUser({ email: `pending_cancel_${Date.now()}@test.com` })
    const createSpy = mock.method(paymentService, 'createPaymentIntent')
    const cancelSpy = mock.method(paymentService, 'cancelPaymentIntent')
    const captureSpy = mock.method(paymentService, 'capturePaymentIntent')
    const refundSpy = mock.method(paymentService, 'refundPaymentIntent')

    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const cancelled = await bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.CANCELLED)
    assert.equal(cancelled.status, BookingStatus.CANCELLED)

    assert.equal(createSpy.mock.callCount(), 0)
    assert.equal(cancelSpy.mock.callCount(), 0)
    assert.equal(captureSpy.mock.callCount(), 0)
    assert.equal(refundSpy.mock.callCount(), 0)
  })

  test('cancelling an ACCEPTED-but-unpaid booking makes no Stripe calls', async () => {
    await giveOwnerStripeAccount(owner.id)
    const renter = await createTestUser({ email: `accepted_cancel_${Date.now()}@test.com` })
    const cancelSpy = mock.method(paymentService, 'cancelPaymentIntent')
    const captureSpy = mock.method(paymentService, 'capturePaymentIntent')
    const refundSpy = mock.method(paymentService, 'refundPaymentIntent')

    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const accepted = await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
    assert.equal(accepted.stripePaymentIntentId, null)

    const cancelled = await bookingService.transitionBookingStatus(accepted.id, renter.id, BookingStatus.CANCELLED)
    assert.equal(cancelled.status, BookingStatus.CANCELLED)

    assert.equal(cancelSpy.mock.callCount(), 0)
    assert.equal(captureSpy.mock.callCount(), 0)
    assert.equal(refundSpy.mock.callCount(), 0)
  })

  test('no auto-rejected booking revives when the accepted booking is later cancelled', async () => {
    await giveOwnerStripeAccount(owner.id)
    const db = getTestPrisma()
    const renterA = await createTestUser({ email: `revive_a_${Date.now()}@test.com` })
    const renterB = await createTestUser({ email: `revive_b_${Date.now()}@test.com` })

    const { startDate, endDate } = futureDates(5, 3)
    const bookingA = await bookingService.createBooking(renterA.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const bookingB = await bookingService.createBooking(renterB.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    await bookingService.transitionBookingStatus(bookingA.id, owner.id, BookingStatus.ACCEPTED)
    const declinedB = await db.booking.findUniqueOrThrow({ where: { id: bookingB.id } })
    assert.equal(declinedB.status, BookingStatus.DECLINED)

    await bookingService.transitionBookingStatus(bookingA.id, owner.id, BookingStatus.CANCELLED)

    const bAfterCancel = await db.booking.findUniqueOrThrow({ where: { id: bookingB.id } })
    assert.equal(bAfterCancel.status, BookingStatus.DECLINED, 'must stay DECLINED — no revival logic exists')
  })

  test('regression guard: cancelling a CONFIRMED (paid) booking still calls Stripe', async () => {
    await giveOwnerStripeAccount(owner.id)
    const renter = await createTestUser({ email: `confirmed_cancel_${Date.now()}@test.com` })
    const cancelSpy = mock.method(paymentService, 'cancelPaymentIntent')

    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
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

    await bookingService.transitionBookingStatus(withIntent.id, renter.id, BookingStatus.CANCELLED)

    assert.equal(cancelSpy.mock.callCount(), 1, 'a CONFIRMED (paid) booking must still release/refund via Stripe on cancel — fees are disabled for launch, so this is the full-release path, not the tiered-fee capture path')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DECLINED reason metadata — manual vs. auto-reject must stay distinguishable
// ─────────────────────────────────────────────────────────────────────────────
describe('DECLINED reason metadata', () => {
  test('a manual lender decline is NOT tagged overlap_auto_reject', async () => {
    const renter = await createTestUser({ email: `manual_decline_${Date.now()}@test.com` })
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.DECLINED)

    const db = getTestPrisma()
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id, type: 'STATUS_CHANGE' } })
    const declineEvent = events.find((e: any) => (e.metadata as any)?.to === 'DECLINED')
    assert.ok(declineEvent)
    assert.equal((declineEvent!.metadata as any).reason, 'manual_decline')
    assert.notEqual((declineEvent!.metadata as any).reason, 'overlap_auto_reject')
  })
})
