/**
 * Integration Tests — hourly Stripe reconciliation
 * ================================================
 * reconcileStripePayments used to write a RECONCILIATION_MATCH booking event
 * for every in-flight booking every hour (unbounded booking_events growth and
 * noise in the admin timeline) and let one Stripe error abort the run.
 * Stripe is mocked on paymentService so outcomes are deterministic.
 */

import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
} from './setup'
import * as paymentService from '../services/paymentService'
import { reconcileStripePayments } from '../services/reconciliationJob'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'

let owner: { id: string }
let renter: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await disconnectTestPrisma()
})

async function createCompletedBooking(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  const { startDate, endDate } = futureDates(3, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(50),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.AUTHORIZED,
      stripePaymentIntentId: `pi_recon_${Math.random().toString(36).slice(2)}`,
      ...overrides,
    },
  })
}

describe('reconcileStripePayments', () => {
  test('records only mismatches, and a Stripe error on one booking does not stop the run', async () => {
    const matching = await createCompletedBooking()
    const drifted = await createCompletedBooking()
    const erroring = await createCompletedBooking()

    mock.method(paymentService, 'retrievePaymentIntent', async (id: string) => {
      if (id === erroring.stripePaymentIntentId) throw new Error('Request rate limit exceeded')
      if (id === drifted.stripePaymentIntentId) return { id, status: 'canceled' }
      return { id, status: 'requires_capture' }
    })

    const result = await reconcileStripePayments()
    assert.deepEqual(result, { checked: 3, mismatches: 1, failed: 1 })

    const db = getTestPrisma()
    const events = await db.bookingEvent.findMany({ where: { bookingId: { in: [matching.id, drifted.id, erroring.id] } } })
    assert.equal(events.filter((e) => e.type === 'RECONCILIATION_MATCH').length, 0, 'matches are not written every hour')
    const mismatches = events.filter((e) => e.type === 'RECONCILIATION_MISMATCH')
    assert.equal(mismatches.length, 1)
    assert.equal(mismatches[0].bookingId, drifted.id)
    const errors = events.filter((e) => e.type === 'ERROR')
    assert.equal(errors.length, 1)
    assert.equal(errors[0].bookingId, erroring.id)
    assert.equal((errors[0].metadata as any)?.action, 'reconcile_payment')
  })
})

describe('reconcileStripePayments without Stripe configured', () => {
  test('writes no booking events', async () => {
    const booking = await createCompletedBooking()
    const saved = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    try {
      const result = await reconcileStripePayments()
      assert.equal(result.checked, 1)
    } finally {
      process.env.STRIPE_SECRET_KEY = saved
    }
    const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: booking.id } })
    assert.equal(events.length, 0)
  })
})
