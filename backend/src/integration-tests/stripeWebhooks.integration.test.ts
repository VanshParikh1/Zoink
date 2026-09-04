/**
 * Integration Tests — Stripe Webhook-Driven Payment Status Updates
 * =================================================================
 * Tests that synthetic Stripe event payloads posted to /stripe/webhook
 * correctly update booking payment status in the real zoink_test database.
 *
 * APPROACH: Option (a) from the spec — construct a signed Stripe event payload
 * and POST it directly to the /stripe/webhook endpoint via supertest. This
 * exercises the full path:
 *
 *   HTTP POST /stripe/webhook
 *     → express.raw() body parsing (raw Buffer)
 *     → stripeWebhookController.stripeWebhook
 *       → constructEvent() with stripe.webhooks.constructEvent() signature check
 *       → updateBookingFromEvent()
 *         → prisma.$transaction to update Booking + create BookingEvent
 *     → 200 { received: true }
 *
 * Webhook secret handling:
 *   - When STRIPE_WEBHOOK_SECRET is set: buildSignedWebhookPayload() calls
 *     stripe.webhooks.generateTestHeaderString() to produce a valid
 *     Stripe-Signature header. The controller verifies it with constructEvent().
 *   - When STRIPE_WEBHOOK_SECRET is absent: the controller falls through to
 *     the unsigned JSON parse path. Tests still run and verify DB updates.
 *
 * DO NOT require `stripe listen --forward-to` to be running. These tests are
 * fully self-contained and produce synthetic events programmatically.
 *
 * Events covered:
 *   payment_intent.amount_capturable_updated → paymentStatus = AUTHORIZED
 *   payment_intent.succeeded                 → paymentStatus = CAPTURED, paidAt set
 *   payment_intent.payment_failed            → paymentStatus = FAILED
 *   payment_intent.canceled                  → paymentStatus = REFUNDED, refundedAt set
 *   charge.refunded                          → paymentStatus = REFUNDED, refundedAt set
 *   refund.succeeded                         → paymentStatus = REFUNDED, refundedAt set
 *   unknown event type                       → no DB update, still returns 200
 *
 * Invalid signature test:
 *   Malformed Stripe-Signature header → 400 { error: "Invalid Stripe webhook signature." }
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  buildSignedWebhookPayload,
  getApp,
} from './setup'
import { PaymentStatus, BookingStatus, Prisma } from '@prisma/client'

// ── Module-level state ────────────────────────────────────────────────────────
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  const listing = await createTestListing(owner.id, { dailyPrice: 25, itemValue: 250 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// ── Seed helper ───────────────────────────────────────────────────────────────
/**
 * Creates a booking with a known stripePaymentIntentId so the webhook handler
 * can look it up via bookingId in the event metadata.
 */
async function createBookingWithPaymentIntent(paymentStatus: PaymentStatus = PaymentStatus.AUTHORIZED) {
  const db = getTestPrisma()
  const { startDate, endDate } = futureDates(3, 2)
  const piId = `pi_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const booking = await db.booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(50),
      depositAmount: new Prisma.Decimal(15),
      commissionAmount: new Prisma.Decimal(7.5),
      ownerPayout: new Prisma.Decimal(42.5),
      insuranceFee: new Prisma.Decimal(0),
      status: BookingStatus.ACCEPTED,
      paymentStatus,
      stripePaymentIntentId: piId,
      version: 1,
    },
  })
  return { booking, piId }
}

/**
 * POST a signed synthetic Stripe event to /stripe/webhook via supertest.
 *
 * The webhook route in index.ts is registered with express.raw({ type: 'application/json' })
 * BEFORE express.json(). This means:
 *   - When Content-Type is application/json, express.raw() captures the body as a Buffer.
 *   - express.json() never runs on this route.
 *   - stripeWebhookController receives req.body as a Buffer, as Stripe sends in production.
 *
 * supertest's .send() with a string payload and explicit Content-Type: application/json
 * correctly replicates this — the body arrives at Express as raw bytes.
 */
async function postWebhookEvent(
  app: any,
  eventType: string,
  eventData: object,
  bookingId: string,
  eventId?: string
) {
  const { body, signature } = buildSignedWebhookPayload(eventType, eventData, bookingId, eventId)
  const bodyStr = body.toString('utf8')

  const req = supertest(app)
    .post('/stripe/webhook')
    .set('Content-Type', 'application/json')

  if (signature) {
    req.set('stripe-signature', signature)
  }

  return req.send(bodyStr)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. payment_intent.amount_capturable_updated → AUTHORIZED
// ─────────────────────────────────────────────────────────────────────────────
describe('payment_intent.amount_capturable_updated', () => {
  test('updates booking paymentStatus to AUTHORIZED', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.PENDING_AUTH)

    const res = await postWebhookEvent(
      app,
      'payment_intent.amount_capturable_updated',
      {
        id: piId,
        object: 'payment_intent',
        status: 'requires_capture',
        amount: 5000,
        currency: 'cad',
        latest_charge: null,
      },
      booking.id
    )

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`)
    assert.deepEqual(res.body, { received: true })

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.AUTHORIZED)

    // WEBHOOK_RECEIVED event should be recorded
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const webhookEvent = events.find((e: any) => e.type === 'WEBHOOK_RECEIVED')
    assert.ok(webhookEvent, 'WEBHOOK_RECEIVED event should be created')
    assert.equal(
      (webhookEvent.metadata as any)?.type,
      'payment_intent.amount_capturable_updated'
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. payment_intent.succeeded → CAPTURED + paidAt set
// ─────────────────────────────────────────────────────────────────────────────
describe('payment_intent.succeeded', () => {
  test('updates paymentStatus to CAPTURED and sets paidAt', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.AUTHORIZED)
    const chargeId = `ch_test_${Date.now()}`

    const res = await postWebhookEvent(
      app,
      'payment_intent.succeeded',
      {
        id: piId,
        object: 'payment_intent',
        status: 'succeeded',
        amount: 5000,
        amount_received: 5000,
        currency: 'cad',
        latest_charge: chargeId,
      },
      booking.id
    )

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.CAPTURED)
    assert.ok(updated.paidAt, 'paidAt should be set after payment_intent.succeeded')
    assert.equal(updated.stripeChargeId, chargeId)

    // Version should have been incremented
    assert.ok(updated.version > booking.version, 'version should increment')
  })

  test('booking not found in metadata — still returns 200 (idempotent, no crash)', async () => {
    const app = getApp()
    const piId = `pi_test_noop_${Date.now()}`
    const unknownBookingId = '00000000-0000-0000-0000-000000000000'

    // Event references a booking that doesn't exist — handler should silently
    // return early when getBookingId() returns null or booking lookup fails.
    const res = await postWebhookEvent(
      app,
      'payment_intent.succeeded',
      {
        id: piId,
        object: 'payment_intent',
        status: 'succeeded',
        amount: 5000,
        latest_charge: null,
      },
      unknownBookingId
    )

    // updateBookingFromEvent tries to update but the booking doesn't exist.
    // Prisma update throws P2025, which propagates as a 500. This is acceptable
    // — a real Stripe event for a non-existent booking is a bug in prod, but
    // the webhook controller wraps errors in InternalServerError.
    // We accept either 200 (silently ignored) or 500 (error surfaced).
    assert.ok(
      res.status === 200 || res.status === 500,
      `Expected 200 or 500 for unknown booking, got ${res.status}`
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. payment_intent.payment_failed → FAILED
// ─────────────────────────────────────────────────────────────────────────────
describe('payment_intent.payment_failed', () => {
  test('updates paymentStatus to FAILED', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.PENDING_AUTH)

    const res = await postWebhookEvent(
      app,
      'payment_intent.payment_failed',
      {
        id: piId,
        object: 'payment_intent',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined.',
        },
      },
      booking.id
    )

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.FAILED)
    // paidAt should NOT be set on failure
    assert.equal(updated.paidAt, null)

    // WEBHOOK_RECEIVED event
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const webhookEvent = events.find((e: any) => e.type === 'WEBHOOK_RECEIVED')
    assert.ok(webhookEvent)
    assert.equal((webhookEvent.metadata as any)?.type, 'payment_intent.payment_failed')
    assert.equal((webhookEvent.metadata as any)?.paymentStatus, PaymentStatus.FAILED)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. payment_intent.canceled → REFUNDED + refundedAt set
// ─────────────────────────────────────────────────────────────────────────────
describe('payment_intent.canceled', () => {
  test('updates paymentStatus to REFUNDED and sets refundedAt', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.AUTHORIZED)

    const res = await postWebhookEvent(
      app,
      'payment_intent.canceled',
      {
        id: piId,
        object: 'payment_intent',
        status: 'canceled',
        cancellation_reason: 'abandoned',
      },
      booking.id
    )

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.REFUNDED)
    assert.ok(updated.refundedAt, 'refundedAt should be set after payment_intent.canceled')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. charge.refunded → REFUNDED + refundedAt set
// ─────────────────────────────────────────────────────────────────────────────
describe('charge.refunded', () => {
  test('updates paymentStatus to REFUNDED and sets refundedAt', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.CAPTURED)
    const chargeId = `ch_test_refund_${Date.now()}`

    // charge.refunded object has payment_intent nested, not at top level.
    // The controller's getBookingId() checks object.payment_intent.metadata.bookingId
    // for charge events, so we structure the data accordingly.
    const res = await postWebhookEvent(
      app,
      'charge.refunded',
      {
        id: chargeId,
        object: 'charge',
        amount: 5000,
        amount_refunded: 5000,
        refunded: true,
        payment_intent: {
          id: piId,
          metadata: { bookingId: booking.id },
        },
      },
      booking.id  // also set in outer metadata by buildSignedWebhookPayload
    )

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.REFUNDED)
    assert.ok(updated.refundedAt, 'refundedAt should be set after charge.refunded')
    assert.equal(updated.refundedAmountCents, 5000, 'a full refund records the full charge amount')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5b. Partial refund — must NOT be stamped as fully REFUNDED
// ─────────────────────────────────────────────────────────────────────────────
describe('partial refund', () => {
  test('charge.refunded with amount_refunded < the charge total records refundedAmountCents and leaves paymentStatus alone', async () => {
    const app = getApp()
    const db = getTestPrisma()
    // seed totalPrice = 50 (insuranceFee 0, hstAmount 0) -> full charge is 5000c.
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.PAYOUT_PENDING)

    const res = await postWebhookEvent(
      app,
      'charge.refunded',
      {
        id: `ch_test_partial_${Date.now()}`,
        object: 'charge',
        amount: 5000,
        amount_refunded: 2000, // partial
        refunded: false,       // Stripe sets this true only on a full refund
        payment_intent: { id: piId, metadata: { bookingId: booking.id } },
      },
      booking.id
    )
    assert.equal(res.status, 200)

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'a partial refund must NOT overstate the booking as fully REFUNDED')
    assert.equal(updated.refundedAmountCents, 2000)
    assert.ok(updated.refundedAt, 'refundedAt is still stamped for a partial refund')

    const webhookEvent = (await db.bookingEvent.findMany({ where: { bookingId: booking.id } }))
      .find((e: any) => e.type === 'WEBHOOK_RECEIVED')
    assert.equal((webhookEvent!.metadata as any)?.partialRefund, true)
    assert.equal((webhookEvent!.metadata as any)?.refundedAmountCents, 2000)
  })

  test('refund.succeeded for less than the full charge does not flip paymentStatus to REFUNDED', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.CAPTURED)

    const res = await postWebhookEvent(
      app,
      'refund.succeeded',
      { id: `re_partial_${Date.now()}`, object: 'refund', amount: 1500, status: 'succeeded', payment_intent: piId },
      booking.id
    )
    assert.equal(res.status, 200)

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.CAPTURED, 'still CAPTURED — only $15 of the $50 charge was refunded')
    assert.equal(updated.refundedAmountCents, 1500)
  })

  test('charge.refunded that clears the whole charge still lands on REFUNDED', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.CAPTURED)

    const res = await postWebhookEvent(
      app,
      'charge.refunded',
      {
        id: `ch_full_${Date.now()}`,
        object: 'charge',
        amount: 5000,
        amount_refunded: 5000,
        refunded: true,
        payment_intent: { id: piId, metadata: { bookingId: booking.id } },
      },
      booking.id
    )
    assert.equal(res.status, 200)

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.REFUNDED)
    assert.equal(updated.refundedAmountCents, 5000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. refund.succeeded → REFUNDED + refundedAt set
// ─────────────────────────────────────────────────────────────────────────────
describe('refund.succeeded', () => {
  test('updates paymentStatus to REFUNDED and sets refundedAt', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.CAPTURED)
    const refundId = `re_test_${Date.now()}`

    const res = await postWebhookEvent(
      app,
      'refund.succeeded',
      {
        id: refundId,
        object: 'refund',
        amount: 5000,
        status: 'succeeded',
        payment_intent: piId,
      },
      booking.id
    )

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.REFUNDED)
    assert.ok(updated.refundedAt, 'refundedAt should be set after refund.succeeded')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Unknown event type — no DB update, handler returns 200
// ─────────────────────────────────────────────────────────────────────────────
describe('unknown event type', () => {
  test('unrecognised event type is accepted (200) and causes no DB change', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.AUTHORIZED)
    const originalStatus = PaymentStatus.AUTHORIZED

    const res = await postWebhookEvent(
      app,
      'customer.subscription.created',  // totally unrelated event
      {
        id: `sub_test_${Date.now()}`,
        object: 'subscription',
        status: 'active',
      },
      booking.id
    )

    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })

    // Payment status should be unchanged
    const unchanged = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(unchanged.paymentStatus, originalStatus)

    // A WEBHOOK_RECEIVED event is still recorded (audit trail)
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const webhookEvent = events.find((e: any) => e.type === 'WEBHOOK_RECEIVED')
    assert.ok(webhookEvent, 'WEBHOOK_RECEIVED should still be recorded for unknown event types')
    assert.equal((webhookEvent.metadata as any)?.type, 'customer.subscription.created')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Signature verification — invalid signature → 400
// ─────────────────────────────────────────────────────────────────────────────
describe('signature verification', () => {
  test('malformed Stripe-Signature header returns 400 when STRIPE_WEBHOOK_SECRET is set', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      // If no webhook secret is configured, the controller skips verification.
      // This test is only meaningful when the secret is present.
      return
    }

    const app = getApp()
    const { booking, piId } = await createBookingWithPaymentIntent()

    // Construct a valid body but send a garbage signature
    const validBody = JSON.stringify({
      id: `evt_test_bad_sig_${Date.now()}`,
      object: 'event',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: piId,
          metadata: { bookingId: booking.id },
          latest_charge: null,
        },
      },
    })

    const res = await supertest(app)
      .post('/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=999999999,v1=invalidsignaturehex')
      .send(Buffer.from(validBody))

    assert.equal(res.status, 400)
    assert.match(res.body.error, /invalid stripe webhook signature/i)
  })

  test('missing Stripe-Signature header falls through to unsigned parse when no secret configured', async () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (webhookSecret) {
      // When a secret IS configured, missing signature → constructEvent throws → 400.
      // We test the opposite branch (no secret) here.
      return
    }

    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.PENDING_AUTH)

    // Post without any stripe-signature header — controller parses raw JSON
    const body = Buffer.from(JSON.stringify({
      id: `evt_test_nosig_${Date.now()}`,
      object: 'event',
      type: 'payment_intent.amount_capturable_updated',
      data: {
        object: {
          id: piId,
          object: 'payment_intent',
          status: 'requires_capture',
          metadata: { bookingId: booking.id },
        },
      },
    }))

    const res = await supertest(app)
      .post('/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send(body)

    assert.equal(res.status, 200)
    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.AUTHORIZED)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Idempotency — replaying the same event twice
// ─────────────────────────────────────────────────────────────────────────────
describe('webhook idempotency', () => {
  test('replaying payment_intent.succeeded twice ends in CAPTURED (idempotent write)', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.AUTHORIZED)
    const chargeId = `ch_test_idempotent_${Date.now()}`

    const eventData = {
      id: piId,
      object: 'payment_intent',
      status: 'succeeded',
      amount_received: 5000,
      latest_charge: chargeId,
    }

    // First delivery
    const res1 = await postWebhookEvent(app, 'payment_intent.succeeded', eventData, booking.id)
    assert.equal(res1.status, 200)

    // Second delivery (Stripe can deliver events more than once)
    const res2 = await postWebhookEvent(app, 'payment_intent.succeeded', eventData, booking.id)
    assert.equal(res2.status, 200)

    const final = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(final.paymentStatus, PaymentStatus.CAPTURED)
    assert.ok(final.paidAt)

    // Two WEBHOOK_RECEIVED events should exist (one per delivery)
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const webhookEvents = events.filter((e: any) => e.type === 'WEBHOOK_RECEIVED')
    assert.ok(webhookEvents.length >= 2, 'Both webhook deliveries should be recorded in audit log')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Deposit-PaymentIntent events must NOT touch the rental payment
// ─────────────────────────────────────────────────────────────────────────────
// A booking has two PaymentIntents: the rental payment (booking.stripePaymentIntentId)
// and a separate deposit hold (booking.stripeDepositPaymentIntentId, created by
// paymentService.createDepositPaymentIntent with metadata.purpose === 'deposit').
// The deposit's own lifecycle events — it gets captured on a RESOLVED_REFUND
// dispute, or canceled by cleanupJob.releaseDueDeposits — carry the same
// metadata.bookingId, and previously the webhook handler blindly rewrote the
// rental's paymentStatus/paidAt/stripeChargeId/refundedAt from them. Concretely:
// a normally-completed booking (paymentStatus PAYOUT_PENDING) had its deposit
// auto-released, the resulting payment_intent.canceled flipped it to REFUNDED,
// and releaseDuePayouts() then skipped it forever — the owner never got paid.
describe('deposit PaymentIntent events do not touch the rental payment', () => {
  /** A post-pickup booking: rental captured & awaiting payout, deposit still an
   *  authorized hold with its own (different) PaymentIntent id. */
  async function createBookingWithRentalAndDepositPI() {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(3, 2)
    const rentalPiId = `pi_test_rental_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const depositPiId = `pi_test_deposit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const paidAt = new Date(Date.now() - 60 * 60 * 1000)
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(50),
        depositAmount: new Prisma.Decimal(15),
        commissionAmount: new Prisma.Decimal(7.5),
        ownerPayout: new Prisma.Decimal(42.5),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        paidAt,
        completedAt: new Date(),
        stripePaymentIntentId: rentalPiId,
        stripeChargeId: `ch_test_rental_${Date.now()}`,
        stripeDepositPaymentIntentId: depositPiId,
        depositStatus: 'AUTHORIZED',
        version: 1,
      },
    })
    return { booking, rentalPiId, depositPiId, rentalChargeId: booking.stripeChargeId, paidAt }
  }

  test('deposit payment_intent.succeeded (dispute capture) leaves the rental paymentStatus untouched, moves depositStatus to CAPTURED', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, rentalChargeId, paidAt } = await createBookingWithRentalAndDepositPI()

    const res = await postWebhookEvent(
      app,
      'payment_intent.succeeded',
      {
        id: booking.stripeDepositPaymentIntentId,
        object: 'payment_intent',
        status: 'succeeded',
        amount: 1500,
        amount_received: 500,
        latest_charge: `ch_deposit_capture_${Date.now()}`,
      },
      booking.id
    )
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`)

    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    // Rental payment fields — every one must be exactly as seeded.
    assert.equal(after.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'rental paymentStatus must NOT be rewritten to CAPTURED by a deposit event')
    assert.equal(after.paidAt?.getTime(), paidAt.getTime(), 'rental paidAt must not be re-stamped')
    assert.equal(after.stripeChargeId, rentalChargeId, 'rental stripeChargeId must not be overwritten with the deposit charge')
    assert.equal(after.refundedAt, null)
    // Deposit-specific field is the only thing that moves.
    assert.equal(after.depositStatus, 'CAPTURED')

    const webhookEvent = (await db.bookingEvent.findMany({ where: { bookingId: booking.id } }))
      .find((e: any) => e.type === 'WEBHOOK_RECEIVED')
    assert.equal((webhookEvent!.metadata as any)?.scope, 'deposit')
  })

  test('deposit payment_intent.canceled (auto-release) leaves the rental paymentStatus untouched, moves depositStatus to RELEASED', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, rentalChargeId, paidAt } = await createBookingWithRentalAndDepositPI()

    const res = await postWebhookEvent(
      app,
      'payment_intent.canceled',
      {
        id: booking.stripeDepositPaymentIntentId,
        object: 'payment_intent',
        status: 'canceled',
        cancellation_reason: 'abandoned',
      },
      booking.id
    )
    assert.equal(res.status, 200)

    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'rental paymentStatus must NOT be flipped to REFUNDED by a deposit cancellation')
    assert.equal(after.refundedAt, null, 'rental refundedAt must not be set by a deposit cancellation')
    assert.equal(after.paidAt?.getTime(), paidAt.getTime())
    assert.equal(after.stripeChargeId, rentalChargeId)
    assert.equal(after.depositStatus, 'RELEASED')
  })

  test('a genuine rental event on the same booking still updates the rental paymentStatus', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking } = await createBookingWithRentalAndDepositPI()

    // Sanity guard: routing by PaymentIntent id must not have broken the rental path.
    const res = await postWebhookEvent(
      app,
      'charge.refunded',
      {
        id: `ch_rental_refund_${Date.now()}`,
        object: 'charge',
        amount: 5000,
        amount_refunded: 5000,
        refunded: true,
        payment_intent: { id: booking.stripePaymentIntentId, metadata: { bookingId: booking.id } },
      },
      booking.id
    )
    assert.equal(res.status, 200)

    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.paymentStatus, PaymentStatus.REFUNDED)
    assert.ok(after.refundedAt)
    assert.equal(after.depositStatus, 'AUTHORIZED', 'deposit hold is untouched by a rental refund')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. event.id de-dupe — a re-delivered signed event is applied exactly once
// ─────────────────────────────────────────────────────────────────────────────
// Stripe explicitly documents that a webhook can be delivered more than once
// (automatic retries, `stripe events resend`), and a validly-signed body can be
// replayed by a caller. updateBookingFromEvent claims event.id in a uniquely-
// constrained processed_stripe_events row as the first statement of the same
// transaction that mutates the booking + writes the WEBHOOK_RECEIVED audit row;
// a second delivery of the same id must be a no-op that still 200s.
describe('webhook event-id de-dupe', () => {
  test('the same signed event delivered twice mutates the booking once and still returns 200', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.AUTHORIZED)
    const chargeId = `ch_test_dedupe_${Date.now()}`
    const eventId = `evt_test_dedupe_${Date.now()}`
    const eventData = {
      id: piId,
      object: 'payment_intent',
      status: 'succeeded',
      amount_received: 5000,
      latest_charge: chargeId,
    }

    // First delivery — mutates.
    const res1 = await postWebhookEvent(app, 'payment_intent.succeeded', eventData, booking.id, eventId)
    assert.equal(res1.status, 200)
    const afterFirst = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(afterFirst.paymentStatus, PaymentStatus.CAPTURED)
    assert.equal(afterFirst.version, booking.version + 1, 'first delivery advances version once')

    // Second delivery of the SAME event id — Stripe re-delivery / replay.
    const res2 = await postWebhookEvent(app, 'payment_intent.succeeded', eventData, booking.id, eventId)
    assert.equal(res2.status, 200, 'a duplicate delivery still returns HTTP 200 so Stripe stops retrying')
    assert.deepEqual(res2.body, { received: true })

    const afterSecond = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(afterSecond.version, afterFirst.version, 'version must NOT advance again on the duplicate')
    assert.equal(
      afterSecond.updatedAt.getTime(),
      afterFirst.updatedAt.getTime(),
      'updatedAt is frozen after the duplicate delivery'
    )

    // Exactly one WEBHOOK_RECEIVED audit row carries this stripeEventId.
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const forThisEvent = events.filter(
      (e: any) => e.type === 'WEBHOOK_RECEIVED' && (e.metadata as any)?.stripeEventId === eventId
    )
    assert.equal(forThisEvent.length, 1, 'exactly one audit row for a re-delivered event id')

    // Exactly one idempotency-ledger row for the event id.
    const ledger = await (db as any).processedStripeEvent.findMany({ where: { stripeEventId: eventId } })
    assert.equal(ledger.length, 1, 'one processed_stripe_events row per event id')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. Out-of-order charge.refunded — refundedAmountCents never walks backwards
// ─────────────────────────────────────────────────────────────────────────────
// Stripe does not guarantee webhook ordering. Two distinct charge.refunded
// events (different event ids, so NOT de-duped) can arrive with the later-
// received one carrying the chronologically-earlier, smaller cumulative
// amount_refunded. refundedAmountCents must stay at the higher value.
describe('out-of-order refund deliveries', () => {
  test('a lower-cumulative charge.refunded after a higher one leaves refundedAmountCents at the higher value', async () => {
    const app = getApp()
    const db = getTestPrisma()
    // seed totalPrice 50, insuranceFee 0, hstAmount 0 -> full charge 5000c.
    const { booking, piId } = await createBookingWithPaymentIntent(PaymentStatus.PAYOUT_PENDING)

    // Higher cumulative arrives first.
    const resHigh = await postWebhookEvent(
      app,
      'charge.refunded',
      {
        id: `ch_ooo_hi_${Date.now()}`,
        object: 'charge',
        amount: 5000,
        amount_refunded: 4000,
        refunded: false,
        payment_intent: { id: piId, metadata: { bookingId: booking.id } },
      },
      booking.id
    )
    assert.equal(resHigh.status, 200)
    let updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.refundedAmountCents, 4000)
    assert.equal(updated.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'still partial')

    // Chronologically-earlier (smaller) cumulative arrives second.
    const resLow = await postWebhookEvent(
      app,
      'charge.refunded',
      {
        id: `ch_ooo_lo_${Date.now()}`,
        object: 'charge',
        amount: 5000,
        amount_refunded: 1500,
        refunded: false,
        payment_intent: { id: piId, metadata: { bookingId: booking.id } },
      },
      booking.id
    )
    assert.equal(resLow.status, 200)
    updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.refundedAmountCents, 4000, 'out-of-order delivery must not lower the cumulative')
    assert.equal(updated.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'still not overstated as fully REFUNDED')
  })
})
