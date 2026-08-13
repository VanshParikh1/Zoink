/**
 * Integration Tests — Dispute Creation and Resolution
 * =====================================================
 * Tests the full dispute lifecycle against the real zoink_test database using
 * Phase 6's disputeService functions directly and through the HTTP layer.
 *
 * Dispute flow:
 *   createDispute()     → Dispute.status = OPEN, Booking.disputeStatus = OPEN
 *   resolveDispute()    → Dispute.status = RESOLVED_REFUND | RESOLVED_NO_ACTION | DISMISSED
 *                         RESOLVED_REFUND also calls refundPaymentIntent()
 *
 * Key constraints tested:
 *   - Only booking participants (renter or owner) can open a dispute
 *   - Only one open dispute per booking at a time
 *   - Already-resolved disputes cannot be resolved again
 *   - RESOLVED_REFUND triggers a Stripe refund (mocked when Stripe absent)
 *   - Admin route requires ADMIN role; USER role gets 403
 *   - BookingEvent audit trail is written for both DISPUTE_OPENED and DISPUTE_RESOLVED
 *
 * Pre-conditions for dispute tests are set up with direct Prisma writes —
 * we don't walk through the full booking lifecycle to get to COMPLETED state
 * in every test. Disputes can technically be raised on any booking status.
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
  signTestJwt,
  getApp,
} from './setup'
import * as disputeService from '../services/disputeService'
import { PaymentStatus, BookingStatus, DisputeStatus, Role, Prisma } from '@prisma/client'

// ── Module-level state ────────────────────────────────────────────────────────
let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let admin: { id: string; email: string; token: string }
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  // Admin user — role=ADMIN so requireAdmin middleware passes
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  const listing = await createTestListing(owner.id, { dailyPrice: 30, itemValue: 300 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// ── Seed helper ───────────────────────────────────────────────────────────────
/**
 * Creates a booking in the given status via direct Prisma write.
 * We use this to set up pre-conditions without walking through the full
 * booking lifecycle in every dispute test.
 */
async function createBookingInStatus(
  status: BookingStatus,
  paymentStatus: PaymentStatus = PaymentStatus.AUTHORIZED,
  totalPrice = 90
) {
  const db = getTestPrisma()
  const { startDate, endDate } = futureDates(3, 3)
  return db.booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(totalPrice),
      depositAmount: new Prisma.Decimal(27),
      commissionAmount: new Prisma.Decimal(13.5),
      ownerPayout: new Prisma.Decimal(76.5),
      insuranceFee: new Prisma.Decimal(0),
      status,
      paymentStatus,
      stripePaymentIntentId: `pi_mock_dispute_${Date.now()}`,
      version: 1,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. createDispute — service layer
// ─────────────────────────────────────────────────────────────────────────────
describe('createDispute — service layer', () => {
  test('renter can open a dispute on their booking', async () => {
    const db = getTestPrisma()
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    const dispute = await disputeService.createDispute(
      booking.id,
      renter.id,
      'ITEM_DAMAGED',
      'The item arrived with a cracked screen and scratches on the body.'
    )

    assert.ok(dispute.id, 'dispute id should be set')
    assert.equal(dispute.bookingId, booking.id)
    assert.equal(dispute.raisedByUserId, renter.id)
    assert.equal(dispute.reason, 'ITEM_DAMAGED')
    assert.equal(dispute.status, 'OPEN')

    // Booking.disputeStatus should be updated
    const updatedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updatedBooking.disputeStatus, 'OPEN')

    // DISPUTE_OPENED event should be recorded
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const disputeEvent = events.find((e: any) => e.type === 'DISPUTE_OPENED')
    assert.ok(disputeEvent, 'DISPUTE_OPENED booking event should be created')
    assert.equal((disputeEvent.metadata as any)?.disputeId, dispute.id)
    assert.equal((disputeEvent.metadata as any)?.reason, 'ITEM_DAMAGED')
  })

  test('owner can open a dispute on their booking', async () => {
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)

    const dispute = await disputeService.createDispute(
      booking.id,
      owner.id,
      'ITEM_NOT_RETURNED',
      'The renter has not returned the item after 3 days past the agreed return date.'
    )

    assert.equal(dispute.raisedByUserId, owner.id)
    assert.equal(dispute.status, 'OPEN')
  })

  test('stranger cannot open a dispute on a booking they are not part of', async () => {
    const stranger = await createTestUser({ email: `stranger_${Date.now()}@test.com` })
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    await assert.rejects(
      () => disputeService.createDispute(
        booking.id,
        stranger.id,
        'OTHER',
        'Some suspicious activity on this booking I am not part of.'
      ),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        assert.match(err.message, /renter or owner/i)
        return true
      }
    )
  })

  test('cannot open a second dispute while one is already OPEN', async () => {
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    await disputeService.createDispute(
      booking.id,
      renter.id,
      'ITEM_DAMAGED',
      'The item arrived with a cracked screen and scratches on the body.'
    )

    await assert.rejects(
      () => disputeService.createDispute(
        booking.id,
        renter.id,
        'PAYMENT_ISSUE',
        'There is also a payment problem that needs to be addressed here.'
      ),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /open dispute already exists/i)
        return true
      }
    )
  })

  test('throws 404 for non-existent booking id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099'
    await assert.rejects(
      () => disputeService.createDispute(
        fakeId,
        renter.id,
        'OTHER',
        'This booking does not exist at all in the database.'
      ),
      (err: any) => {
        assert.equal(err.statusCode, 404)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Helper: creates a real captured Stripe PaymentIntent using Stripe's test
// payment-method token (pm_card_visa), which Stripe supports confirming
// server-side without a client — needed here because refundPaymentIntent()
// calls the live Stripe refunds API, and a refund is only valid against a
// PaymentIntent that has actually been captured.
// ─────────────────────────────────────────────────────────────────────────────
async function createCapturedStripePaymentIntent(amountCents: number): Promise<string> {
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
  await stripe.paymentIntents.capture(intent.id, { amount_to_capture: amountCents })
  return intent.id
}

// Same as above but deliberately left uncaptured — a manual-capture authorization
// hold, matching what a booking looks like before pickup (paymentStatus AUTHORIZED).
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. resolveDispute — RESOLVED_REFUND
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveDispute — RESOLVED_REFUND', () => {
  test('resolving with RESOLVED_NO_ACTION updates dispute and booking disputeStatus', async () => {
    const db = getTestPrisma()
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Item was returned with significant damage to the lens and body.'
    )

    const resolved = await disputeService.resolveDispute(
      dispute.id,
      admin.id,
      DisputeStatus.RESOLVED_NO_ACTION,
      'Reviewed evidence. Normal wear accepted — no refund warranted.'
    )

    assert.equal(resolved.status, DisputeStatus.RESOLVED_NO_ACTION)
    assert.equal(resolved.resolvedByAdminId, admin.id)
    assert.ok(resolved.resolvedAt, 'resolvedAt should be set')
    assert.ok(resolved.resolutionNotes, 'resolutionNotes should be set')

    const updatedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updatedBooking.disputeStatus, DisputeStatus.RESOLVED_NO_ACTION)

    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const resolvedEvent = events.find((e: any) => e.type === 'DISPUTE_RESOLVED')
    assert.ok(resolvedEvent, 'DISPUTE_RESOLVED booking event should be created')
    assert.equal((resolvedEvent.metadata as any)?.disputeId, dispute.id)
    assert.equal((resolvedEvent.metadata as any)?.status, DisputeStatus.RESOLVED_NO_ACTION)
  })

  test('RESOLVED_REFUND on a captured booking refunds via Stripe and updates Booking.paymentStatus', async () => {
    const db = getTestPrisma()
    const totalPrice = 90
    const stripePaymentIntentId = await createCapturedStripePaymentIntent(9000)
    const booking = await createBookingInStatus(BookingStatus.COMPLETED, PaymentStatus.CAPTURED, totalPrice)
    await db.booking.update({ where: { id: booking.id }, data: { stripePaymentIntentId } })

    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Item was returned broken and the renter has confirmed responsibility.'
    )

    const resolved = await disputeService.resolveDispute(
      dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND,
      'Confirmed damage — refunding the renter in full.'
    )

    assert.equal(resolved.status, DisputeStatus.RESOLVED_REFUND)

    // Booking.paymentStatus must reflect the refund that already happened via Stripe above —
    // this is the fix for the bug where paymentStatus was left stale (e.g. still CAPTURED).
    const updatedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updatedBooking.paymentStatus, PaymentStatus.REFUNDED)
    assert.ok(updatedBooking.refundedAt, 'refundedAt should be set')
    assert.equal(updatedBooking.disputeStatus, DisputeStatus.RESOLVED_REFUND)
  })

  test('RESOLVED_REFUND with a partial refundAmountCents refunds only that amount via Stripe', async () => {
    const db = getTestPrisma()
    const totalPrice = 90
    const stripePaymentIntentId = await createCapturedStripePaymentIntent(9000)
    const booking = await createBookingInStatus(BookingStatus.COMPLETED, PaymentStatus.CAPTURED, totalPrice)
    await db.booking.update({ where: { id: booking.id }, data: { stripePaymentIntentId } })

    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Minor cosmetic scratch on the casing — a partial refund is appropriate here.'
    )

    const partialRefundCents = 3000 // $30 of the $90 total
    const resolved = await disputeService.resolveDispute(
      dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND,
      'Confirmed minor cosmetic damage — refunding 30% of the total.',
      partialRefundCents
    )

    assert.equal(resolved.status, DisputeStatus.RESOLVED_REFUND)
    // The queryable column the payout-calculation logic (or a human, for now) reads back.
    assert.equal(resolved.refundAmountCents, partialRefundCents)

    // paymentStatus/disputeStatus flip the same way as a full refund — REFUNDED does not
    // distinguish partial from full (see the TODO in stripeWebhookController.ts).
    const updatedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updatedBooking.paymentStatus, PaymentStatus.REFUNDED)
    assert.ok(updatedBooking.refundedAt, 'refundedAt should be set')
    assert.equal(updatedBooking.disputeStatus, DisputeStatus.RESOLVED_REFUND)

    // Confirm against the real Stripe test-mode PaymentIntent that only the partial amount
    // was actually refunded, not the full $90.
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
    const refunds = await stripe.refunds.list({ payment_intent: stripePaymentIntentId })
    const totalRefundedCents = refunds.data.reduce((sum: number, r: any) => sum + r.amount, 0)
    assert.equal(totalRefundedCents, partialRefundCents)
  })

  test('RESOLVED_REFUND on booking without stripePaymentIntentId throws 409', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(3, 3)
    // Booking with no payment intent — simulates a booking that never got a PI
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(90),
        depositAmount: new Prisma.Decimal(27),
        commissionAmount: new Prisma.Decimal(13.5),
        ownerPayout: new Prisma.Decimal(76.5),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.CAPTURED,
        stripePaymentIntentId: null,  // intentionally null
      },
    })
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Item was severely damaged and needs to be replaced entirely now.'
    )

    // resolveDispute calls refundPaymentIntent which throws ConflictError for null PI
    await assert.rejects(
      () => disputeService.resolveDispute(
        dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND,
        'Refund approved.'
      ),
      (err: any) => {
        // Service wraps as InternalServerError with the ConflictError message
        assert.ok(err.statusCode === 500 || err.statusCode === 409,
          `Expected 500 or 409, got ${err.statusCode}`)
        return true
      }
    )
  })

  test('RESOLVED_REFUND (full) on an uncaptured (AUTHORIZED) booking cancels the PaymentIntent instead of refunding', async () => {
    const db = getTestPrisma()
    const totalPrice = 90
    const stripePaymentIntentId = await createAuthorizedStripePaymentIntent(9000)
    const booking = await createBookingInStatus(BookingStatus.PICKUP_PENDING, PaymentStatus.AUTHORIZED, totalPrice)
    await db.booking.update({ where: { id: booking.id }, data: { stripePaymentIntentId } })

    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_NOT_AS_DESCRIBED',
      'Renter wants to cancel before pickup — item is not as described in the listing.'
    )

    const resolved = await disputeService.resolveDispute(
      dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND,
      'Approved — payment was never captured, releasing the authorization hold.'
    )

    assert.equal(resolved.status, DisputeStatus.RESOLVED_REFUND)

    // Stripe never had a refundable Charge here — confirm the PaymentIntent was
    // canceled, not refunded (refunds.create against an uncaptured PI's charge
    // would throw, which is exactly the 500 this fix eliminates).
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
    const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId)
    assert.equal(intent.status, 'canceled')

    const refunds = await stripe.refunds.list({ payment_intent: stripePaymentIntentId })
    assert.equal(refunds.data.length, 0, 'no refund should have been created for an uncaptured PaymentIntent')
  })

  test('RESOLVED_REFUND with a partial refundAmountCents on an uncaptured booking is rejected with a clear error, not a raw Stripe 500', async () => {
    const totalPrice = 90
    const stripePaymentIntentId = await createAuthorizedStripePaymentIntent(9000)
    const db = getTestPrisma()
    const booking = await createBookingInStatus(BookingStatus.PICKUP_PENDING, PaymentStatus.AUTHORIZED, totalPrice)
    await db.booking.update({ where: { id: booking.id }, data: { stripePaymentIntentId } })

    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'OTHER',
      'Testing a partial refund request before the payment has been captured.'
    )

    await assert.rejects(
      () => disputeService.resolveDispute(
        dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND,
        'Attempting a partial refund pre-capture — should be rejected.',
        3000
      ),
      (err: any) => {
        assert.equal(err.statusCode, 400, `Expected a clear 400, got ${err.statusCode}: ${err.message}`)
        assert.match(err.message, /partial refund.*not possible.*captured/i)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. resolveDispute — RESOLVED_NO_ACTION and DISMISSED
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveDispute — RESOLVED_NO_ACTION and DISMISSED', () => {
  test('RESOLVED_NO_ACTION closes dispute without refund', async () => {
    const db = getTestPrisma()
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_NOT_AS_DESCRIBED',
      'The item did not match the listing photos in several important ways.'
    )

    const resolved = await disputeService.resolveDispute(
      dispute.id, admin.id,
      DisputeStatus.RESOLVED_NO_ACTION,
      'Reviewed photos — item condition matches listing description within normal wear.'
    )

    assert.equal(resolved.status, DisputeStatus.RESOLVED_NO_ACTION)
    assert.ok(resolved.resolvedAt)

    const updatedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updatedBooking.disputeStatus, DisputeStatus.RESOLVED_NO_ACTION)
  })

  test('DISMISSED closes dispute without refund', async () => {
    const db = getTestPrisma()
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'OTHER',
      'Raised by mistake — duplicate of a previous dispute for the same issue.'
    )

    const resolved = await disputeService.resolveDispute(
      dispute.id, admin.id,
      DisputeStatus.DISMISSED,
      'Duplicate dispute — dismissed per admin review process.'
    )

    assert.equal(resolved.status, DisputeStatus.DISMISSED)

    const updatedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updatedBooking.disputeStatus, DisputeStatus.DISMISSED)
  })

  test('cannot resolve an already-resolved dispute', async () => {
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'PAYMENT_ISSUE',
      'There was a double charge on my payment method for this booking.'
    )

    await disputeService.resolveDispute(
      dispute.id, admin.id,
      DisputeStatus.DISMISSED,
      'Not a valid payment issue — single charge confirmed by Stripe.'
    )

    await assert.rejects(
      () => disputeService.resolveDispute(
        dispute.id, admin.id,
        DisputeStatus.RESOLVED_NO_ACTION,
        'Attempting second resolution — should fail.'
      ),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /already resolved/i)
        return true
      }
    )
  })

  test('can open a new dispute after previous one is resolved', async () => {
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    const firstDispute = await disputeService.createDispute(
      booking.id, renter.id, 'OTHER',
      'First issue that was quickly resolved by admin without any action.'
    )
    await disputeService.resolveDispute(
      firstDispute.id, admin.id, DisputeStatus.DISMISSED, 'Dismissed.'
    )

    // New dispute should succeed now that the previous one is resolved
    const secondDispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'A separate new damage issue discovered after the first dispute was closed.'
    )
    assert.equal(secondDispute.status, 'OPEN')
    assert.ok(secondDispute.id !== firstDispute.id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. HTTP layer — POST /disputes (user route)
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /disputes — HTTP layer', () => {
  test('renter can create a dispute via HTTP — returns 201', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    const res = await supertest(app)
      .post('/disputes')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({
        bookingId: booking.id,
        reason: 'ITEM_DAMAGED',
        description: 'The item arrived with significant damage to the lens housing.',
      })

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`)
    assert.ok(res.body.id)
    assert.equal(res.body.status, 'OPEN')
    assert.equal(res.body.reason, 'ITEM_DAMAGED')
    assert.equal(res.body.bookingId, booking.id)
  })

  test('POST /disputes returns 400 with too-short description', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    const res = await supertest(app)
      .post('/disputes')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({
        bookingId: booking.id,
        reason: 'ITEM_DAMAGED',
        description: 'Short.',  // < 10 characters
      })

    assert.equal(res.status, 400)
    assert.ok(res.body.error, 'error field should be present')
  })

  test('POST /disputes returns 400 with invalid reason enum', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    const res = await supertest(app)
      .post('/disputes')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({
        bookingId: booking.id,
        reason: 'COMPLETELY_INVALID_REASON',
        description: 'This has an invalid reason enum value.',
      })

    assert.equal(res.status, 400)
  })

  test('POST /disputes returns 401 without auth token', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    const res = await supertest(app)
      .post('/disputes')
      .send({
        bookingId: booking.id,
        reason: 'ITEM_DAMAGED',
        description: 'Valid description of a real damage issue.',
      })

    assert.equal(res.status, 401)
  })

  test('POST /disputes returns 403 for stranger (not a booking participant)', async () => {
    const app = getApp()
    const stranger = await createTestUser({ email: `stranger_${Date.now()}@test.com` })
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)

    const res = await supertest(app)
      .post('/disputes')
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({
        bookingId: booking.id,
        reason: 'OTHER',
        description: 'A stranger trying to open a dispute on someone else booking.',
      })

    assert.equal(res.status, 403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. HTTP layer — PATCH /admin/disputes/:id/resolve (admin route)
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /admin/disputes/:id/resolve — HTTP layer', () => {
  test('admin can resolve a dispute via HTTP — returns 200', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Item was returned broken and non-functional. Repair estimate is $150.'
    )

    const res = await supertest(app)
      .patch(`/admin/disputes/${dispute.id}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        status: 'RESOLVED_NO_ACTION',
        resolutionNotes: 'Normal wear and tear — no refund warranted by policy.',
      })

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.status, 'RESOLVED_NO_ACTION')
    assert.ok(res.body.resolvedAt)
    assert.equal(res.body.resolutionNotes, 'Normal wear and tear — no refund warranted by policy.')
  })

  test('non-admin USER role returns 403 on admin resolve endpoint', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Item came back with a cracked screen and bent frame from misuse.'
    )

    const res = await supertest(app)
      .patch(`/admin/disputes/${dispute.id}/resolve`)
      .set('Authorization', `Bearer ${renter.token}`)  // USER role, not ADMIN
      .send({
        status: 'RESOLVED_NO_ACTION',
        resolutionNotes: 'Renter trying to self-resolve their own dispute.',
      })

    assert.equal(res.status, 403)
  })

  test('admin resolve returns 401 without auth token', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'OTHER',
      'A miscellaneous dispute that needs to be reviewed by an administrator.'
    )

    const res = await supertest(app)
      .patch(`/admin/disputes/${dispute.id}/resolve`)
      .send({ status: 'DISMISSED', resolutionNotes: 'No auth provided.' })

    assert.equal(res.status, 401)
  })

  test('admin resolve returns 404 for non-existent dispute id', async () => {
    const app = getApp()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const res = await supertest(app)
      .patch(`/admin/disputes/${fakeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        status: 'DISMISSED',
        resolutionNotes: 'This dispute does not exist in the database.',
      })

    assert.equal(res.status, 404)
  })

  test('admin GET /admin/disputes lists all disputes', async () => {
    const app = getApp()
    const booking1 = await createBookingInStatus(BookingStatus.ACTIVE)
    const booking2 = await createBookingInStatus(BookingStatus.COMPLETED)

    await disputeService.createDispute(
      booking1.id, renter.id, 'ITEM_DAMAGED',
      'First item was returned with visible damage to the outer casing.'
    )
    await disputeService.createDispute(
      booking2.id, owner.id, 'ITEM_NOT_RETURNED',
      'Renter has kept the item for two weeks past the agreed return date.'
    )

    const res = await supertest(app)
      .get('/admin/disputes')
      .set('Authorization', `Bearer ${admin.token}`)

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body))
    assert.equal(res.body.length, 2)
  })

  test('admin GET /admin/disputes filters by status', async () => {
    const app = getApp()
    const booking1 = await createBookingInStatus(BookingStatus.ACTIVE)
    const booking2 = await createBookingInStatus(BookingStatus.COMPLETED)

    const d1 = await disputeService.createDispute(
      booking1.id, renter.id, 'ITEM_DAMAGED',
      'Damage to the screen protector and main body of the rented device.'
    )
    await disputeService.createDispute(
      booking2.id, renter.id, 'PAYMENT_ISSUE',
      'An unexpected charge appeared on my statement for this rental period.'
    )

    // Resolve the first one
    await disputeService.resolveDispute(
      d1.id, admin.id, DisputeStatus.DISMISSED, 'Dismissed.'
    )

    const res = await supertest(app)
      .get('/admin/disputes?status=OPEN')
      .set('Authorization', `Bearer ${admin.token}`)

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body))
    assert.equal(res.body.length, 1)
    assert.equal(res.body[0].status, 'OPEN')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5b. PATCH /admin/disputes/:id/resolve — refundAmountCents bounds validation
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /admin/disputes/:id/resolve — refundAmountCents validation', () => {
  test('rejects a negative refundAmountCents before it reaches the service', async () => {
    const db = getTestPrisma()
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Testing a negative refund amount, which should be rejected up front.'
    )

    const res = await supertest(app)
      .patch(`/admin/disputes/${dispute.id}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'RESOLVED_REFUND', resolutionNotes: 'Should not go through.', refundAmountCents: -100 })

    assert.equal(res.status, 400)
    assert.ok(res.body.error)

    const untouched = await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    assert.equal(untouched.status, 'OPEN', 'dispute must be untouched by a rejected request')
  })

  test('rejects a zero refundAmountCents before it reaches the service', async () => {
    const db = getTestPrisma()
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.COMPLETED)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Testing a zero refund amount, which should be rejected up front.'
    )

    const res = await supertest(app)
      .patch(`/admin/disputes/${dispute.id}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'RESOLVED_REFUND', resolutionNotes: 'Should not go through.', refundAmountCents: 0 })

    assert.equal(res.status, 400)

    const untouched = await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    assert.equal(untouched.status, 'OPEN', 'dispute must be untouched by a rejected request')
  })

  test('rejects a refundAmountCents that exceeds booking.totalPrice', async () => {
    const db = getTestPrisma()
    const app = getApp()
    const totalPrice = 90 // 9000 cents
    const booking = await createBookingInStatus(BookingStatus.COMPLETED, PaymentStatus.AUTHORIZED, totalPrice)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Testing a refund amount above the booking total, which should be rejected.'
    )

    const res = await supertest(app)
      .patch(`/admin/disputes/${dispute.id}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'RESOLVED_REFUND', resolutionNotes: 'Should not go through.', refundAmountCents: 9001 })

    assert.equal(res.status, 400)
    assert.match(res.body.error, /cannot exceed/i)

    // Nothing should have been mutated — no Stripe call, no dispute/booking update.
    const untouchedDispute = await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    assert.equal(untouchedDispute.status, 'OPEN')
    const untouchedBooking = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(untouchedBooking.disputeStatus, 'OPEN')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET /disputes — user's own disputes
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /disputes — user dispute list', () => {
  test('renter sees only their own disputes', async () => {
    const app = getApp()
    const renter2 = await createTestUser({ email: `renter2_${Date.now()}@test.com` })

    // Create a second listing so renter2 can have their own booking
    const listing2 = await createTestListing(owner.id, { dailyPrice: 10 })
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(5, 2)
    const booking2 = await db.booking.create({
      data: {
        listingId: listing2.id,
        renterId: renter2.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(20),
        depositAmount: new Prisma.Decimal(6),
        commissionAmount: new Prisma.Decimal(3),
        ownerPayout: new Prisma.Decimal(17),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.ACTIVE,
        paymentStatus: PaymentStatus.AUTHORIZED,
      },
    })

    const booking1 = await createBookingInStatus(BookingStatus.ACTIVE)
    await disputeService.createDispute(
      booking1.id, renter.id, 'ITEM_DAMAGED',
      'Renter one sees damage on the device that was not present before pickup.'
    )
    await disputeService.createDispute(
      booking2.id, renter2.id, 'OTHER',
      'Renter two has a different issue with a completely separate booking.'
    )

    const res = await supertest(app)
      .get('/disputes')
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body))
    assert.equal(res.body.length, 1, 'renter should only see their own disputes')
    assert.equal(res.body[0].raisedByUserId, renter.id)
  })

  test('GET /disputes/:id returns dispute for participant', async () => {
    const app = getApp()
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'A clearly described item damage issue for retrieval test verification.'
    )

    const res = await supertest(app)
      .get(`/disputes/${dispute.id}`)
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.id, dispute.id)
    assert.equal(res.body.status, 'OPEN')
  })

  test('GET /disputes/:id returns 403 for non-participant', async () => {
    const app = getApp()
    const stranger = await createTestUser({ email: `stranger_${Date.now()}@test.com` })
    const booking = await createBookingInStatus(BookingStatus.ACTIVE)
    const dispute = await disputeService.createDispute(
      booking.id, renter.id, 'ITEM_DAMAGED',
      'Only participants should be able to view this dispute record.'
    )

    const res = await supertest(app)
      .get(`/disputes/${dispute.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)

    assert.equal(res.status, 403)
  })
})
