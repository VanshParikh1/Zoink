/**
 * Integration Tests — Stripe webhooks delivered out of order
 * ==========================================================
 * Stripe doesn't guarantee delivery order, and retries can arrive days late.
 * A rental event may only move paymentStatus forward; a late event that
 * describes an earlier moment is recorded for audit and otherwise ignored.
 * Synthetic signed events, no Stripe network needed.
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
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import { releaseDuePayouts } from '../services/cleanupJob'

let owner: { id: string }
let renter: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

after(async () => {
  await disconnectTestPrisma()
})

async function booking(status: BookingStatus, paymentStatus: PaymentStatus, extra: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  const { startDate, endDate } = futureDates(3, 2)
  const piId = `pi_order_${Math.random().toString(36).slice(2, 10)}`
  const row = await getTestPrisma().booking.create({
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
      hstAmount: new Prisma.Decimal(6.5),
      status,
      paymentStatus,
      stripePaymentIntentId: piId,
      version: 1,
      ...extra,
    },
  })
  return { row, piId }
}

async function deliver(type: string, piId: string, bookingId: string, extra: object = {}) {
  const { body, signature } = buildSignedWebhookPayload(type, { id: piId, object: 'payment_intent', ...extra }, bookingId)
  const req = supertest(getApp()).post('/stripe/webhook').set('Content-Type', 'application/json')
  if (signature) req.set('stripe-signature', signature)
  const res = await req.send(body.toString('utf8'))
  assert.equal(res.status, 200, JSON.stringify(res.body))
  return getTestPrisma().booking.findUniqueOrThrow({ where: { id: bookingId } })
}

describe('rental paymentStatus only moves forward', () => {
  test('a late amount_capturable_updated does not undo a capture', async () => {
    const { row, piId } = await booking(BookingStatus.ACTIVE, PaymentStatus.CAPTURED, { paidAt: new Date() })
    const after = await deliver('payment_intent.amount_capturable_updated', piId, row.id)
    assert.equal(after.paymentStatus, PaymentStatus.CAPTURED)
  })

  test('a late payment_failed (an earlier card attempt) does not fail an authorized booking', async () => {
    const { row, piId } = await booking(BookingStatus.CONFIRMED, PaymentStatus.AUTHORIZED)
    const after = await deliver('payment_intent.payment_failed', piId, row.id, { last_payment_error: { code: 'card_declined' } })
    assert.equal(after.paymentStatus, PaymentStatus.AUTHORIZED)
  })

  test('a late amount_capturable_updated does not revive a released authorization', async () => {
    const { row, piId } = await booking(BookingStatus.CANCELLED, PaymentStatus.REFUNDED, { refundedAt: new Date() })
    const after = await deliver('payment_intent.amount_capturable_updated', piId, row.id)
    assert.equal(after.paymentStatus, PaymentStatus.REFUNDED)
  })

  test('a late payment_intent.succeeded does not reset a booking that is owed or has had its payout', async () => {
    for (const status of [PaymentStatus.PAYOUT_PENDING, PaymentStatus.PAID_OUT]) {
      const { row, piId } = await booking(BookingStatus.COMPLETED, status, { completedAt: new Date(), paidAt: new Date() })
      const after = await deliver('payment_intent.succeeded', piId, row.id, { latest_charge: 'ch_late' })
      assert.equal(after.paymentStatus, status)
      assert.notEqual(after.stripeChargeId, 'ch_late', 'paidAt/charge from the first delivery are kept')
    }
  })

  test('a capture confirmed only after the return still gets the owner paid', async () => {
    // The return completed while the pickup capture's webhook was still in
    // flight, so the booking finished at CAPTURE_PENDING. When the webhook
    // lands it must be owed a payout, or releaseDuePayouts never sees it.
    const { row, piId } = await booking(BookingStatus.COMPLETED, PaymentStatus.CAPTURE_PENDING, {
      completedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    })
    const after = await deliver('payment_intent.succeeded', piId, row.id, { latest_charge: 'ch_pickup' })
    assert.equal(after.paymentStatus, PaymentStatus.PAYOUT_PENDING)
    assert.ok(after.paidAt)
    assert.equal(after.stripeChargeId, 'ch_pickup')

    await getTestPrisma().user.update({ where: { id: owner.id }, data: { stripeAccountId: null } })
    const due = await getTestPrisma().booking.count({ where: { id: row.id, paymentStatus: PaymentStatus.PAYOUT_PENDING, payoutSentAt: null } })
    assert.equal(due, 1, 'the payout job will pick it up')
    // With no connected account the job skips rather than failing.
    const result = await releaseDuePayouts()
    assert.equal(result.failed, 0)
  })

  test('in-order events still advance as before', async () => {
    const { row, piId } = await booking(BookingStatus.ACCEPTED, PaymentStatus.PENDING_AUTH)
    let after = await deliver('payment_intent.amount_capturable_updated', piId, row.id)
    assert.equal(after.paymentStatus, PaymentStatus.AUTHORIZED)
    after = await deliver('payment_intent.succeeded', piId, row.id, { latest_charge: 'ch_1' })
    assert.equal(after.paymentStatus, PaymentStatus.CAPTURED)
    assert.equal(after.stripeChargeId, 'ch_1')
  })

  test('a declined first card followed by a good one ends authorized', async () => {
    const { row, piId } = await booking(BookingStatus.ACCEPTED, PaymentStatus.PENDING_AUTH)
    let after = await deliver('payment_intent.payment_failed', piId, row.id)
    assert.equal(after.paymentStatus, PaymentStatus.FAILED)
    after = await deliver('payment_intent.amount_capturable_updated', piId, row.id)
    assert.equal(after.paymentStatus, PaymentStatus.AUTHORIZED)
  })
})
