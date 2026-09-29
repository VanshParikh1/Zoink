/**
 * Integration Tests — scheduled payment jobs isolate per-booking failures
 * ======================================================================
 * releaseDuePayouts / releaseDueDeposits / reconcileStripePayments loop over
 * bookings calling Stripe. A single failing booking (a restricted connected
 * account, a PaymentIntent Stripe already canceled, a network blip) used to
 * throw out of the loop, so every later booking was skipped on every run
 * until someone intervened.
 *
 * Stripe calls are mocked on the paymentService module so failures are
 * deterministic and no network is needed.
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
import { releaseDuePayouts, releaseDueDeposits } from '../services/cleanupJob'
import { BookingStatus, DepositStatus, PaymentStatus, Prisma } from '@prisma/client'

let owner: { id: string }
let renter: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_isolation' })
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
      depositAmount: new Prisma.Decimal(20),
      commissionAmount: new Prisma.Decimal(7.5),
      ownerPayout: new Prisma.Decimal(42.5),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      completedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      stripePaymentIntentId: `pi_iso_${Math.random().toString(36).slice(2)}`,
      version: 1,
      ...overrides,
    },
  })
}

async function errorEvents(bookingId: string) {
  return getTestPrisma().bookingEvent.findMany({ where: { bookingId, type: 'ERROR' } })
}

describe('releaseDuePayouts', () => {
  test('a failed transfer is recorded and does not stop the remaining payouts', async () => {
    const failing = await createCompletedBooking()
    const healthy = await createCompletedBooking()

    mock.method(paymentService, 'transferPayout', async (booking: { id: string }) => {
      if (booking.id === failing.id) throw new Error('Your destination account needs to have at least one of the following capabilities enabled')
      return { id: `tr_ok_${booking.id}` }
    })

    const result = await releaseDuePayouts()
    assert.deepEqual(result, { checked: 2, paid: 1, failed: 1 })

    const db = getTestPrisma()
    const paid = await db.booking.findUniqueOrThrow({ where: { id: healthy.id } })
    assert.equal(paid.paymentStatus, PaymentStatus.PAID_OUT)
    assert.ok(paid.payoutSentAt)

    const stuck = await db.booking.findUniqueOrThrow({ where: { id: failing.id } })
    assert.equal(stuck.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'left for the next run')
    assert.equal(stuck.payoutSentAt, null)
    const errors = await errorEvents(failing.id)
    assert.equal(errors.length, 1)
    assert.equal((errors[0].metadata as any)?.action, 'release_payout')
  })
})

describe('releaseDueDeposits', () => {
  test('a failed deposit release is recorded and does not stop the remaining releases', async () => {
    const depositFields = {
      depositStatus: DepositStatus.AUTHORIZED,
      stripeDepositPaymentIntentId: `pi_dep_${Math.random().toString(36).slice(2)}`,
    }
    const failing = await createCompletedBooking({ ...depositFields })
    const healthy = await createCompletedBooking({ ...depositFields, stripeDepositPaymentIntentId: `pi_dep_${Math.random().toString(36).slice(2)}` })

    mock.method(paymentService, 'cancelPaymentIntent', async (ref: { id: string; stripePaymentIntentId: string | null }) => {
      if (ref.id === failing.id) throw new Error('This PaymentIntent could not be canceled because it has a status of canceled.')
      return { id: ref.stripePaymentIntentId, status: 'canceled' }
    })

    const result = await releaseDueDeposits()
    assert.deepEqual(result, { checked: 2, released: 1, failed: 1 })

    const db = getTestPrisma()
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: healthy.id } })).depositStatus, DepositStatus.RELEASED)
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: failing.id } })).depositStatus, DepositStatus.AUTHORIZED)
    const errors = await errorEvents(failing.id)
    assert.equal(errors.length, 1)
    assert.equal((errors[0].metadata as any)?.action, 'release_deposit')
  })
})
