/**
 * Integration Tests — Pay retries reuse or retire the previous PaymentIntent
 * =========================================================================
 * POST /bookings/:id/payment-intent used to mint a brand-new rental
 * PaymentIntent on every call. A renter who authorized once and then tapped
 * Pay again (e.g. confirm raced the webhook) ended up with the first
 * authorization orphaned on their card for ~7 days.
 *
 * Runs against Stripe TEST mode — skipped when api.stripe.com is unreachable.
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
  getApp,
  checkStripeConnectivity,
  confirmTestPaymentIntent,
} from './setup'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'

let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let listingId: string

function stripeClient() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
}

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { dailyPrice: 20, itemValue: 200 })).id
})

after(async () => {
  await disconnectTestPrisma()
})

async function createAcceptedBooking() {
  const { startDate, endDate } = futureDates(5, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(40),
      depositAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(6),
      ownerPayout: new Prisma.Decimal(34),
      insuranceFee: new Prisma.Decimal(0),
      hstAmount: new Prisma.Decimal(5.2),
      status: BookingStatus.ACCEPTED,
    },
  })
}

function pay(bookingId: string) {
  return supertest(getApp())
    .post(`/bookings/${bookingId}/payment-intent`)
    .set('Authorization', `Bearer ${renter.token}`)
}

describe('POST /bookings/:id/payment-intent — retries', () => {
  test('a second Pay before the renter confirms reuses the same PaymentIntent', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe test API unreachable')
    const booking = await createAcceptedBooking()

    const first = await pay(booking.id)
    assert.equal(first.status, 200, JSON.stringify(first.body))
    const second = await pay(booking.id)
    assert.equal(second.status, 200, JSON.stringify(second.body))

    assert.equal(second.body.stripePaymentIntentId, first.body.stripePaymentIntentId)
    assert.equal(second.body.paymentClientSecret, first.body.paymentClientSecret)
    assert.equal(second.body.version, first.body.version, 'reuse does not touch the booking row')
    assert.deepEqual(Object.keys(second.body).sort(), Object.keys(first.body).sort(), 'same response shape')

    const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: booking.id, type: 'PAYMENT_INTENT_CREATED' } })
    assert.equal(events.filter((e: any) => (e.metadata as any)?.reused === true).length, 1)
  })

  test('a previous PaymentIntent whose amount no longer matches is canceled before a new one is created', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe test API unreachable')
    const booking = await createAcceptedBooking()

    const first = await pay(booking.id)
    assert.equal(first.status, 200, JSON.stringify(first.body))
    const oldPiId = first.body.stripePaymentIntentId

    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { totalPrice: new Prisma.Decimal(60) } })

    const second = await pay(booking.id)
    assert.equal(second.status, 200, JSON.stringify(second.body))
    assert.notEqual(second.body.stripePaymentIntentId, oldPiId)
    assert.deepEqual(Object.keys(second.body).sort(), Object.keys(first.body).sort(), 'same response shape')

    const old = await stripeClient().paymentIntents.retrieve(oldPiId)
    assert.equal(old.status, 'canceled')
    const fresh = await stripeClient().paymentIntents.retrieve(second.body.stripePaymentIntentId)
    assert.equal(fresh.amount, Math.round((60 + 0 + 5.2) * 100))
  })

  test('an already-authorized PaymentIntent is released (not left held) when the renter pays again', async (t) => {
    if (!stripeAvailable) return t.skip('Stripe test API unreachable')
    const booking = await createAcceptedBooking()

    const first = await pay(booking.id)
    assert.equal(first.status, 200, JSON.stringify(first.body))
    const oldPiId = first.body.stripePaymentIntentId
    await confirmTestPaymentIntent(oldPiId)
    assert.equal((await stripeClient().paymentIntents.retrieve(oldPiId)).status, 'requires_capture')

    const second = await pay(booking.id)
    assert.equal(second.status, 200, JSON.stringify(second.body))
    assert.notEqual(second.body.stripePaymentIntentId, oldPiId)

    const old = await stripeClient().paymentIntents.retrieve(oldPiId)
    assert.equal(old.status, 'canceled', 'the first authorization must not stay held on the card')

    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(row.stripePaymentIntentId, second.body.stripePaymentIntentId)
    assert.equal(row.paymentStatus, PaymentStatus.PENDING_AUTH)
    assert.equal(row.refundedAt, null)
  })
})
