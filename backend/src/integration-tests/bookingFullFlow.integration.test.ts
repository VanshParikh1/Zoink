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
  confirmTestPaymentIntent,
} from './setup'
import * as bookingService from '../services/bookingService'
import * as paymentService from '../services/paymentService'
import * as conversationService from '../services/conversationService'
import * as disputeService from '../services/disputeService'
import * as handoffService from '../services/handoffService'
import { PaymentStatus, BookingStatus, DisputeStatus, Role, Prisma } from '@prisma/client'

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
    // $100 rental snapshot (the $15 deposit is now its own PaymentIntent,
    // authorized separately once this one confirms — see Step 5).
    await db.listing.update({ where: { id: listingId }, data: { dailyPrice: new Prisma.Decimal(999) } })

    const withIntent = await bookingService.createPaymentIntentForBooking(acceptedA.id, borrowerA.id)
    assert.ok(withIntent.stripePaymentIntentId)
    assert.ok(withIntent.paymentClientSecret)
    // The booking response itself still reflects the original snapshot —
    // recomputing from the (now $999/day) listing would give totalPrice 4995.
    assert.equal(withIntent.totalPrice, 100, 'totalPrice must stay the original snapshot, not recompute from the changed listing price')
    assert.equal(withIntent.hstAmount, 13, '13% HST on the $100 rental snapshot, not the changed $4995 price')
    // Commission/ownerPayout are unaffected by HST — it's additive on top of
    // what the borrower pays, never subtracted from totalPrice beforehand.
    assert.equal(withIntent.commissionAmount, 15, '15% commission (tier 1, $20/day) on $100 — unaffected by HST')
    assert.equal(withIntent.ownerPayout, 85, '$100 - $15 commission — unaffected by HST')

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const paymentIntent = await stripe.paymentIntents.retrieve(withIntent.stripePaymentIntentId!)
      // toCents(100 totalPrice + 0 insuranceFee + 13 hstAmount) = 11300 — the
      // deposit is no longer part of this PaymentIntent's authorized amount.
      // If this were wrongly recomputed from the changed $999/day listing, it
      // would be toCents(4995 + HST on that) instead — nowhere close.
      assert.equal(paymentIntent.amount, 11300, 'Stripe should have been charged the ORIGINAL snapshotted rental amount plus HST, not a recomputed one')
    }

    // ── Step 5: Confirm payment — CONFIRMED, dates NOW lock, deposit authorized ──
    // Reaching CONFIRMED now also authorizes the $15 deposit as its own
    // off-session PaymentIntent, reusing the payment method attached above —
    // which requires the rental PaymentIntent to have actually been confirmed
    // with a real test card first (a bare paymentStatus write is no longer
    // enough to fake it).
    await confirmTestPaymentIntent(withIntent.stripePaymentIntentId!)
    await db.booking.update({ where: { id: withIntent.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } })
    const confirmedA = await bookingService.transitionBookingStatus(withIntent.id, borrowerA.id, BookingStatus.CONFIRMED)
    assert.equal(confirmedA.status, BookingStatus.CONFIRMED)
    assert.ok(confirmedA.stripeDepositPaymentIntentId, 'a separate deposit PaymentIntent should now be authorized')
    assert.equal(confirmedA.depositStatus, 'AUTHORIZED')

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const depositIntent = await stripe.paymentIntents.retrieve(confirmedA.stripeDepositPaymentIntentId!)
      assert.equal(depositIntent.amount, 1500, 'the deposit PaymentIntent should be authorized for exactly the $15 deposit')
      assert.equal(depositIntent.status, 'requires_capture', 'the deposit should be an uncaptured authorization, held for the full rental')
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// Zero-fee cancellation and partial-refund payment edge cases — kept as their
// own describe blocks (separate from the happy-path test above) so a
// regression in either one bisects cleanly without implicating the full flow.
// ─────────────────────────────────────────────────────────────────────────────

/** Poll the DB up to `maxMs` milliseconds until paymentStatus changes from
 *  the initial value — mirrors the same helper in
 *  bookingCancellation.integration.test.ts. */
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
    await new Promise((r) => setTimeout(r, 100))
  }
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } })
  return b.paymentStatus
}

describe('zero-fee cancellation does not attempt a $0 capture', () => {
  test('cancelling a CONFIRMED booking (feeCents === 0) calls cancelPaymentIntent, never capturePaymentIntent', async () => {
    await giveOwnerStripeAccount(owner.id)
    const db = getTestPrisma()
    const renter = await createTestUser({ email: `zerofee_${Date.now()}@test.com` })

    const { startDate, endDate } = futureDates(3, 2) // $20/day x 2 = $40
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const accepted = await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
    const withIntent = await bookingService.createPaymentIntentForBooking(accepted.id, renter.id)
    assert.ok(withIntent.stripePaymentIntentId, 'a real PaymentIntent must exist before cancellation')

    await db.booking.update({
      where: { id: withIntent.id },
      data: { status: BookingStatus.CONFIRMED, paymentStatus: PaymentStatus.AUTHORIZED, version: { increment: 1 } },
    })

    // Cancellation fees are disabled for launch (calculateCancellationFeeCents()
    // in bookingService.ts always returns 0), so this CONFIRMED cancellation
    // hits the feeCents === 0 branch of handleCancellationPayment() on every run.
    const captureSpy = mock.method(paymentService, 'capturePaymentIntent')
    const cancelSpy = mock.method(paymentService, 'cancelPaymentIntent')

    const cancelled = await bookingService.transitionBookingStatus(withIntent.id, renter.id, BookingStatus.CANCELLED)
    assert.equal(cancelled.status, BookingStatus.CANCELLED)

    // A $0 capture is not a real Stripe amount — capturePaymentIntent(booking, 0)
    // would raise a live Stripe error if ever called with a zero override.
    assert.equal(captureSpy.mock.callCount(), 0, 'capturePaymentIntent must never be called for a $0 fee')
    assert.equal(cancelSpy.mock.callCount(), 1, 'cancelPaymentIntent should release the full authorization instead')

    const finalStatus = await waitForPaymentStatus(withIntent.id, PaymentStatus.AUTHORIZED)
    const acceptableStatuses: PaymentStatus[] = [PaymentStatus.REFUND_PENDING, PaymentStatus.REFUNDED]
    assert.ok(
      acceptableStatuses.includes(finalStatus),
      `Expected REFUND_PENDING or REFUNDED after a zero-fee cancellation, got: ${finalStatus}`
    )

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const intent = await stripe.paymentIntents.retrieve(withIntent.stripePaymentIntentId!)
      assert.equal(intent.status, 'canceled', 'the real Stripe PaymentIntent should have been canceled, not captured')
    }
  })
})

describe('dispute resolution with a partial refundAmountCents', () => {
  // Same shape as disputeResolution.integration.test.ts's authorized-PI helper —
  // a manual-capture PaymentIntent confirmed but never captured, matching what
  // the deposit PaymentIntent looks like after CONFIRMED and before any
  // dispute resolves it.
  async function createAuthorizedStripePaymentIntent(amountCents: number): Promise<string> {
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: process.env.STRIPE_CURRENCY ?? 'cad',
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
      confirm: true,
      capture_method: 'manual',
    })
    return intent.id
  }

  // As of the separate-deposit-PaymentIntent change, a dispute resolved on a
  // COMPLETED booking targets the deposit PaymentIntent via a Stripe *capture*
  // (it's still just an authorization at that point, held since CONFIRMED) —
  // not a refunds.create() call against the already-settled rental payment.
  test('resolving a dispute on a COMPLETED booking captures exactly refundAmountCents from the deposit PaymentIntent, not the full deposit', async () => {
    const db = getTestPrisma()
    const renter = await createTestUser({ email: `partial_refund_${Date.now()}@test.com` })
    const admin = await createTestUser({ email: `admin_partial_${Date.now()}@test.com`, role: Role.ADMIN })

    const depositAmount = 15
    const stripeDepositPaymentIntentId = await createAuthorizedStripePaymentIntent(1500)

    // A COMPLETED booking whose rental payment has already settled (paidAt set,
    // paymentStatus past capture) and whose deposit is still an authorized,
    // uncaptured hold — exactly what cleanupJob.releaseDueDeposits would find
    // if no dispute were filed within the window (see DISPUTE_WINDOW_HOURS).
    const { startDate, endDate } = futureDates(3, 3)
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(100),
        depositAmount: new Prisma.Decimal(depositAmount),
        commissionAmount: new Prisma.Decimal(15),
        ownerPayout: new Prisma.Decimal(85),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        paidAt: new Date(Date.now() - 60 * 60 * 1000),
        completedAt: new Date(),
        stripePaymentIntentId: `pi_mock_rental_settled_${Date.now()}`,
        stripeDepositPaymentIntentId,
        depositStatus: 'AUTHORIZED',
        version: 1,
      },
    })

    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Minor scuff found on return — a partial charge against the deposit is appropriate, not the full amount.'
    )

    const partialCaptureCents = 500 // less than the full $15 (1500 cents) deposit
    const resolved = await disputeService.resolveDispute(
      dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND,
      'Confirmed minor damage — charging $5 of the $15 deposit, not the full amount.',
      partialCaptureCents
    )
    assert.equal(resolved.status, DisputeStatus.RESOLVED_REFUND)
    assert.equal(resolved.refundAmountCents, partialCaptureCents)

    // Ground truth: the deposit PaymentIntent must be CAPTURED for exactly
    // partialCaptureCents, never the full deposit, and never refunded (nothing
    // was ever captured on it before this, so there is nothing to refund).
    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const depositIntent = await stripe.paymentIntents.retrieve(stripeDepositPaymentIntentId)
      assert.equal(depositIntent.status, 'succeeded')
      assert.equal(depositIntent.amount_received, partialCaptureCents, 'Stripe should show exactly the partial amount captured')
      assert.notEqual(depositIntent.amount_received, 1500, 'the full deposit must NOT have been captured')

      const refunds = await stripe.refunds.list({ payment_intent: stripeDepositPaymentIntentId })
      assert.equal(refunds.data.length, 0, 'a capture, not a refund, should have been used')
    }

    const updatedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updatedBooking.depositStatus, 'CAPTURED')
    // The rental payment's own paymentStatus/refundedAt are untouched — this
    // resolution only concerns the deposit.
    assert.equal(updatedBooking.paymentStatus, PaymentStatus.PAYOUT_PENDING)
    assert.equal(updatedBooking.refundedAt, null)
  })

  test('filing a second dispute on the same COMPLETED booking is rejected once the deposit has already been resolved', async () => {
    const db = getTestPrisma()
    const renter = await createTestUser({ email: `deposit_double_resolve_${Date.now()}@test.com` })
    const admin = await createTestUser({ email: `admin_double_resolve_${Date.now()}@test.com`, role: Role.ADMIN })

    const stripeDepositPaymentIntentId = await createAuthorizedStripePaymentIntent(1500)
    const { startDate, endDate } = futureDates(3, 3)
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(100),
        depositAmount: new Prisma.Decimal(15),
        commissionAmount: new Prisma.Decimal(15),
        ownerPayout: new Prisma.Decimal(85),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        paidAt: new Date(Date.now() - 60 * 60 * 1000),
        completedAt: new Date(),
        stripePaymentIntentId: `pi_mock_rental_settled_${Date.now()}`,
        stripeDepositPaymentIntentId,
        depositStatus: 'AUTHORIZED',
        version: 1,
      },
    })

    const firstDispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED', 'First issue — resolving with a partial deposit charge.'
    )
    await disputeService.resolveDispute(
      firstDispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Charging $5 of the deposit.', 500
    )

    // Unlike the pre-completion refund flow (which supports several sequential
    // partial refunds against one captured Charge), the deposit PaymentIntent
    // can only be captured once — a second dispute has nothing left to act on,
    // so it's now rejected up front at filing time (createDispute), not later
    // at resolution.
    await assert.rejects(
      () => disputeService.createDispute(
        booking.id, renter.id, 'OTHER', 'A separate issue discovered after the first dispute was already resolved.'
      ),
      (err: any) => {
        assert.equal(err.statusCode, 400, `Expected 400, got ${err.statusCode}: ${err.message}`)
        assert.match(err.message, /deposit.*already been resolved/i)
        return true
      }
    )

    const disputesOnBooking = await db.dispute.findMany({ where: { bookingId: booking.id } })
    assert.equal(disputesOnBooking.length, 1, 'only the first, already-resolved dispute should exist')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Separate deposit PaymentIntent — authorized off-session at CONFIRMED, held
// through pickup, untouched by the rental capture. Kept as its own describe
// block, separate from the happy-path test above, so a regression here
// bisects cleanly.
// ─────────────────────────────────────────────────────────────────────────────
describe('separate deposit PaymentIntent — pickup capture excludes it', () => {
  test('pickup handoff captures only rental+insurance; the deposit PaymentIntent stays untouched, authorized separately', async () => {
    await giveOwnerStripeAccount(owner.id)
    const renter = await createTestUser({ email: `deposit_pickup_${Date.now()}@test.com` })

    const { startDate, endDate } = futureDates(3, 2) // $20/day x 2 = $40 rental, $15 deposit
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const accepted = await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
    const withIntent = await bookingService.createPaymentIntentForBooking(accepted.id, renter.id)

    await confirmTestPaymentIntent(withIntent.stripePaymentIntentId!)
    const db = getTestPrisma()
    await db.booking.update({ where: { id: withIntent.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } })

    const confirmed = await bookingService.transitionBookingStatus(withIntent.id, renter.id, BookingStatus.CONFIRMED)
    assert.ok(confirmed.stripeDepositPaymentIntentId, 'the deposit should be authorized as its own PaymentIntent by CONFIRMED')
    assert.equal(confirmed.depositStatus, 'AUTHORIZED')

    const photos = [
      'https://res.cloudinary.com/test/image/upload/pickup1.jpg',
      'https://res.cloudinary.com/test/image/upload/pickup2.jpg',
    ]
    await handoffService.initiateHandoff(confirmed.id, owner.id, 'pickup', photos)
    await handoffService.confirmHandoff(confirmed.id, owner.id, 'pickup')
    const renterTap = await handoffService.confirmHandoff(confirmed.id, renter.id, 'pickup')
    assert.equal(renterTap.bothConfirmed, true)
    assert.equal(renterTap.booking.status, BookingStatus.ACTIVE)

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })

      const rentalIntent = await stripe.paymentIntents.retrieve(confirmed.stripePaymentIntentId!)
      assert.equal(rentalIntent.status, 'succeeded')
      // $40 rental + $5.20 HST (13%) = $45.20 = 4520 cents — no deposit, no insurance.
      assert.equal(rentalIntent.amount_received, 4520, 'pickup should capture only the $40 rental total plus HST — no deposit, no insurance')

      const depositIntent = await stripe.paymentIntents.retrieve(confirmed.stripeDepositPaymentIntentId!)
      assert.equal(depositIntent.status, 'requires_capture', 'the deposit must remain an untouched authorization at pickup, held through the full rental')
      assert.equal(depositIntent.amount, 1500)
    }
  })

  test('deposit authorization failure prevents CONFIRMED and cancels the rental PaymentIntent instead of leaving it dangling', async () => {
    await giveOwnerStripeAccount(owner.id)
    const renter = await createTestUser({ email: `deposit_fail_${Date.now()}@test.com` })

    const { startDate, endDate } = futureDates(3, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const accepted = await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED)
    const withIntent = await bookingService.createPaymentIntentForBooking(accepted.id, renter.id)

    await confirmTestPaymentIntent(withIntent.stripePaymentIntentId!)
    const db = getTestPrisma()
    await db.booking.update({ where: { id: withIntent.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } })

    // Force the deposit off-session authorization to fail, simulating e.g. a
    // decline on the second charge even though the rental PaymentIntent above
    // succeeded moments ago.
    const depositSpy = mock.method(paymentService, 'createDepositPaymentIntent', async () => {
      throw new Error('Deposit card declined (forced for test)')
    })

    await assert.rejects(
      () => bookingService.transitionBookingStatus(withIntent.id, renter.id, BookingStatus.CONFIRMED),
      (err: any) => {
        assert.equal(err.statusCode, 409, `Expected 409, got ${err.statusCode}: ${err.message}`)
        assert.match(err.message, /could not authorize the deposit/i)
        return true
      }
    )
    assert.equal(depositSpy.mock.callCount(), 1)

    // The booking must NOT end up CONFIRMED with only the rental portion
    // secured and no deposit hold in place — it stays exactly where it was.
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: withIntent.id } })
    assert.equal(persisted.status, BookingStatus.ACCEPTED, 'booking must stay out of CONFIRMED when the deposit cannot be authorized')
    assert.equal(persisted.stripeDepositPaymentIntentId, null, 'no deposit PaymentIntent id should be persisted on failure')
    assert.equal(persisted.depositStatus, null)

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const rentalIntent = await stripe.paymentIntents.retrieve(withIntent.stripePaymentIntentId!)
      assert.equal(rentalIntent.status, 'canceled', 'the rental PaymentIntent must be canceled, not left dangling as an authorized hold, since the borrower never actually completed payment')
    }
  })
})
