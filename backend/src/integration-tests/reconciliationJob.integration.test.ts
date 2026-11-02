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
  await truncateAllTables()
  await disconnectTestPrisma()
})

/** The job only runs with Stripe configured. retrievePaymentIntent is mocked
 *  in these tests, so no request is made; without a real test key in
 *  .env.test, a placeholder stands in for the duration of `run`. */
async function withStripeConfigured<T>(run: () => Promise<T>): Promise<T> {
  const saved = process.env.STRIPE_SECRET_KEY
  process.env.STRIPE_SECRET_KEY ||= 'sk_test_placeholder_mocked'
  try {
    return await run()
  } finally {
    if (saved === undefined) delete process.env.STRIPE_SECRET_KEY
    else process.env.STRIPE_SECRET_KEY = saved
  }
}

function stripeError(code: string, message: string) {
  return Object.assign(new Error(message), { type: 'StripeInvalidRequestError', code, raw: { code, message } })
}

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

    const result = await withStripeConfigured(reconcileStripePayments)
    assert.deepEqual(result, { checked: 3, mismatches: 1, failed: 1, missing: 0 })

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

describe('a PaymentIntent Stripe has never heard of (resource_missing)', () => {
  test('is logged once, recorded on the booking, and skipped on every later run', async () => {
    const orphan = await createCompletedBooking({ stripePaymentIntentId: `pi_mock_confirmed_${Date.now()}` })
    const healthy = await createCompletedBooking()
    const calls: string[] = []
    mock.method(paymentService, 'retrievePaymentIntent', async (id: string) => {
      calls.push(id)
      if (id === orphan.stripePaymentIntentId) throw stripeError('resource_missing', `No such payment_intent: '${id}'`)
      return { id, status: 'requires_capture' }
    })
    const warn = mock.method(console, 'warn', () => {})

    const first = await withStripeConfigured(reconcileStripePayments)
    assert.deepEqual(first, { checked: 2, mismatches: 0, failed: 0, missing: 1 })
    assert.equal(warn.mock.callCount(), 1, 'logged once')

    const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: orphan.id } })
    assert.equal(events.length, 1, 'no ERROR row (and no Sentry report) for a missing PaymentIntent')
    assert.equal(events[0].type, 'RECONCILIATION_MISMATCH')
    assert.equal((events[0].metadata as any).reason, 'payment_intent_missing')

    // The next hourly runs don't ask Stripe about it again.
    const second = await withStripeConfigured(reconcileStripePayments)
    const third = await withStripeConfigured(reconcileStripePayments)
    assert.deepEqual(second, { checked: 1, mismatches: 0, failed: 0, missing: 0 })
    assert.deepEqual(third, second)
    assert.equal(calls.filter((id) => id === orphan.stripePaymentIntentId).length, 1)
    assert.equal(calls.filter((id) => id === healthy.stripePaymentIntentId).length, 3)
    assert.equal(warn.mock.callCount(), 1)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: orphan.id } })
    assert.equal(row.paymentStatus, PaymentStatus.AUTHORIZED, 'audit-only: the booking itself is untouched')
  })

  test('other Stripe errors are still retried next run, and never stop the job', async () => {
    const flaky = await createCompletedBooking()
    mock.method(paymentService, 'retrievePaymentIntent', async () => {
      throw stripeError('rate_limit', 'Request rate limit exceeded')
    })
    mock.method(console, 'error', () => {})
    assert.deepEqual(await withStripeConfigured(reconcileStripePayments), { checked: 1, mismatches: 0, failed: 1, missing: 0 })
    assert.deepEqual(await withStripeConfigured(reconcileStripePayments), { checked: 1, mismatches: 0, failed: 1, missing: 0 })
    const errors = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: flaky.id, type: 'ERROR' } })
    assert.equal(errors.length, 2)
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
      if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved
    }
    const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: booking.id } })
    assert.equal(events.length, 0)
  })
})
