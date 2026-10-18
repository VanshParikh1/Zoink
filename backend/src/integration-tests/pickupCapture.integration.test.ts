/**
 * Integration Tests — Pickup only happens once the rent is captured
 * =================================================================
 * The rent is captured when both parties tap Zoink It at pickup. If Stripe
 * refuses the capture, the pickup must not go through: the booking stays
 * PICKUP_PENDING (never ACTIVE with an unpaid rental), both phones get a clear
 * 409, the failure is recorded on the booking, and the next tap tries a fresh
 * capture (Stripe replays a failed result for an idempotency key it has seen).
 *
 * Stripe is mocked here (mock.method on paymentService), so these run without
 * network access.
 */

import test, { after, afterEach, beforeEach, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import {
  createTestListing,
  createTestUser,
  disconnectTestPrisma,
  futureDates,
  getApp,
  getTestPrisma,
  truncateAllTables,
} from './setup'
import * as paymentService from '../services/paymentService'

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { dailyPrice: 20, depositAmount: 0 })).id
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await disconnectTestPrisma()
})

const PHOTOS = [
  'https://res.cloudinary.com/demo/image/upload/p1.jpg',
  'https://res.cloudinary.com/demo/image/upload/p2.jpg',
]

/** A paid booking at pickup with photos up and the renter already tapped, so
 *  the owner's tap is the one that captures. */
async function bookingAwaitingOwnerTap() {
  const { startDate, endDate } = futureDates(1, 2)
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
      status: BookingStatus.PICKUP_PENDING,
      paymentStatus: PaymentStatus.AUTHORIZED,
      paidAt: new Date(),
      stripePaymentIntentId: `pi_mock_pickup_${Date.now()}`,
      pickupPhotos: PHOTOS,
      handoffInitiatedAt: new Date(),
      renterPickupTappedAt: new Date(),
      version: 1,
    },
  })
}

function ownerTaps(bookingId: string) {
  return supertest(getApp())
    .post(`/bookings/${bookingId}/zoink-tap`)
    .set('Authorization', `Bearer ${owner.token}`)
    .send({ phase: 'pickup' })
}

describe('a failed capture at pickup blocks the handoff', () => {
  test('the booking stays PICKUP_PENDING, both get a 409, and the failure is recorded', async () => {
    const booking = await bookingAwaitingOwnerTap()
    mock.method(paymentService, 'capturePaymentIntent', async () => {
      throw new Error('This PaymentIntent could not be captured because it has a status of canceled.')
    })
    mock.method(paymentService, 'retrievePaymentIntent', async () => ({ status: 'canceled' }))

    const res = await ownerTaps(booking.id)
    assert.equal(res.status, 409, JSON.stringify(res.body))
    assert.match(res.body.error, /payment couldn't be collected/i)
    assert.match(res.body.error, /keep the item/i)

    const db = getTestPrisma()
    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.status, BookingStatus.PICKUP_PENDING, 'never ACTIVE without the rent captured')
    assert.equal(after.paymentStatus, PaymentStatus.AUTHORIZED, 'paymentStatus left to Stripe webhooks')
    assert.equal(after.ownerPickupTappedAt, null, 'the failed tap is not recorded as a tap')
    assert.ok(after.renterPickupTappedAt, "the renter's tap is kept so the owner can retry inside the window")
    assert.equal(after.startDate.toISOString(), booking.startDate.toISOString(), 'startDate not overwritten')
    assert.equal(after.version, 2, 'version bumped so the retry gets a fresh capture key')

    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    assert.equal(events.filter((e) => e.type === 'STATUS_CHANGE').length, 0)
    assert.equal(events.filter((e) => e.type === 'ZOINK_TAP').length, 0)
    const errors = events.filter((e) => e.type === 'ERROR')
    assert.equal(errors.length, 1)
    assert.equal((errors[0].metadata as any).action, 'capture_payment')
    assert.equal((errors[0].metadata as any).blockedHandoff, true)
  })

  test('tapping again after a failure retries the capture with a new key and completes the pickup', async () => {
    const booking = await bookingAwaitingOwnerTap()
    const capture = mock.method(paymentService, 'capturePaymentIntent', async () => {
      throw new Error('An error occurred with our connection to Stripe.')
    })
    mock.method(paymentService, 'retrievePaymentIntent', async () => ({ status: 'requires_capture' }))

    assert.equal((await ownerTaps(booking.id)).status, 409)

    capture.mock.mockImplementation(async (b: any) => ({ id: b.stripePaymentIntentId, status: 'succeeded' }))
    const retry = await ownerTaps(booking.id)
    assert.equal(retry.status, 200, JSON.stringify(retry.body))

    const versions = capture.mock.calls.map((c) => (c.arguments[0] as any).version)
    assert.deepEqual(versions, [1, 2], 'second attempt carries the bumped version, so a new idempotency key')

    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.status, BookingStatus.ACTIVE)
    assert.equal(after.paymentStatus, PaymentStatus.CAPTURE_PENDING)
    assert.ok(after.ownerPickupTappedAt)
  })

  test('a capture Stripe already completed (lost response) counts as captured', async () => {
    const booking = await bookingAwaitingOwnerTap()
    mock.method(paymentService, 'capturePaymentIntent', async () => {
      throw new Error('This PaymentIntent could not be captured because it has a status of succeeded.')
    })
    mock.method(paymentService, 'retrievePaymentIntent', async () => ({ status: 'succeeded' }))

    const res = await ownerTaps(booking.id)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.status, BookingStatus.ACTIVE)
  })

  test('a successful capture still activates the booking in one step', async () => {
    const booking = await bookingAwaitingOwnerTap()
    const capture = mock.method(paymentService, 'capturePaymentIntent', async (b: any) => ({ id: b.stripePaymentIntentId, status: 'succeeded' }))

    const res = await ownerTaps(booking.id)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(capture.mock.callCount(), 1)

    const db = getTestPrisma()
    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.status, BookingStatus.ACTIVE)
    assert.equal(after.version, 2)
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    assert.equal(events.filter((e) => e.type === 'STATUS_CHANGE' && (e.metadata as any)?.to === 'ACTIVE').length, 1)
    assert.equal(events.filter((e) => e.type === 'ERROR').length, 0)
  })

  test('the first tap of the pair never calls Stripe', async () => {
    const booking = await bookingAwaitingOwnerTap()
    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { renterPickupTappedAt: null } })
    const capture = mock.method(paymentService, 'capturePaymentIntent', async () => {
      throw new Error('should not be called')
    })

    const res = await ownerTaps(booking.id)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(capture.mock.callCount(), 0)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.status, BookingStatus.PICKUP_PENDING)
  })
})
