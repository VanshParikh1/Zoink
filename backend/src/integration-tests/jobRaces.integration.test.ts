/**
 * Integration Tests — payment jobs and disputes under concurrency
 * ===============================================================
 * The deposit and payout jobs run every 15 minutes, can overlap (a slow run,
 * a restart, two instances) and race a dispute filed at the 24-hour mark.
 * Each booking is now re-checked under its row lock before Stripe is called,
 * and createDispute takes the same lock. Stripe is mocked on the
 * paymentService module, so these are deterministic and need no network.
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
import { createDispute } from '../services/disputeService'
import { BookingStatus, DepositStatus, DisputeStatus, PaymentStatus, Prisma } from '@prisma/client'

let owner: { id: string }
let renter: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_races' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await disconnectTestPrisma()
})

async function completedBooking(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
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
      stripePaymentIntentId: `pi_race_${Math.random().toString(36).slice(2)}`,
      depositStatus: DepositStatus.AUTHORIZED,
      stripeDepositPaymentIntentId: `pi_dep_race_${Math.random().toString(36).slice(2)}`,
      version: 1,
      ...overrides,
    },
  })
}

/** Holds a row lock on the booking (as a dispute filing would) and applies
 *  `change` inside it; resolves `locked` once the lock is held. */
function holdBookingLock(bookingId: string, change: Prisma.BookingUpdateInput) {
  let release!: () => void
  let locked!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const lockHeld = new Promise<void>((r) => (locked = r))
  const done = getTestPrisma().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
      await tx.booking.update({ where: { id: bookingId }, data: change })
      locked()
      await gate
    },
    { timeout: 20_000 }
  )
  return { lockHeld, release, done }
}

describe('releaseDueDeposits', () => {
  test('two overlapping runs release a deposit once', async () => {
    const booking = await completedBooking()
    const cancel = mock.method(paymentService, 'cancelDepositPaymentIntent', async (ref: { stripeDepositPaymentIntentId: string }) => {
      await new Promise((r) => setTimeout(r, 50))
      return { id: ref.stripeDepositPaymentIntentId, status: 'canceled' }
    })

    const [first, second] = await Promise.all([releaseDueDeposits(), releaseDueDeposits()])

    assert.equal(first.released + second.released, 1)
    assert.equal(cancel.mock.callCount(), 1, 'Stripe is asked to release the hold once')
    const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: booking.id, type: 'PAYMENT_REFUNDED' } })
    assert.equal(events.length, 1)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.depositStatus, DepositStatus.RELEASED)
  })

  test('a dispute filed while the job is running keeps the deposit held', async () => {
    const booking = await completedBooking()
    const cancel = mock.method(paymentService, 'cancelDepositPaymentIntent', async () => ({ status: 'canceled' }))

    // The dispute holds the row lock and opens; the job has already listed the
    // booking as due, then waits on the lock and must see the dispute.
    const dispute = holdBookingLock(booking.id, { disputeStatus: DisputeStatus.OPEN })
    await dispute.lockHeld
    const job = releaseDueDeposits()
    await new Promise((r) => setTimeout(r, 300))
    dispute.release()
    await dispute.done
    const result = await job

    assert.equal(result.released, 0)
    assert.equal(cancel.mock.callCount(), 0, 'the hold is not released while a dispute is open')
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.depositStatus, DepositStatus.AUTHORIZED)
  })
})

describe('releaseDuePayouts', () => {
  test('two overlapping runs pay the owner once', async () => {
    const booking = await completedBooking()
    const transfer = mock.method(paymentService, 'transferPayout', async (b: { id: string }) => {
      await new Promise((r) => setTimeout(r, 50))
      return { id: `tr_${b.id}` }
    })

    const [first, second] = await Promise.all([releaseDuePayouts(), releaseDuePayouts()])

    assert.equal(first.paid + second.paid, 1)
    assert.equal(transfer.mock.callCount(), 1, 'one transfer for one booking')
    const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: booking.id, type: 'PAYOUT_TRIGGERED' } })
    assert.equal(events.length, 1)
  })

  test('a dispute filed while the job is running holds the payout', async () => {
    const booking = await completedBooking()
    const transfer = mock.method(paymentService, 'transferPayout', async () => ({ id: 'tr_should_not_happen' }))

    const dispute = holdBookingLock(booking.id, { disputeStatus: DisputeStatus.OPEN })
    await dispute.lockHeld
    const job = releaseDuePayouts()
    await new Promise((r) => setTimeout(r, 300))
    dispute.release()
    await dispute.done
    const result = await job

    assert.equal(result.paid, 0)
    assert.equal(transfer.mock.callCount(), 0)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.payoutSentAt, null)
    assert.equal(after.paymentStatus, PaymentStatus.PAYOUT_PENDING)
  })
})

describe('createDispute', () => {
  test('two filings at once open one dispute', async () => {
    const booking = await completedBooking({ completedAt: new Date(Date.now() - 60 * 60 * 1000) })

    const results = await Promise.allSettled([
      createDispute(booking.id, renter.id, 'ITEM_DAMAGED', 'The case came back cracked down one side.'),
      createDispute(booking.id, owner.id, 'ITEM_DAMAGED', 'The case came back cracked down one side.'),
    ])

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    assert.match(rejected.reason.message, /open dispute already exists/)
    assert.equal(await getTestPrisma().dispute.count({ where: { bookingId: booking.id } }), 1)
  })

  test('a filing that loses the race to the deposit release is refused', async () => {
    const booking = await completedBooking({ completedAt: new Date(Date.now() - 60 * 60 * 1000) })

    // The release job holds the lock and releases the deposit first.
    const release = holdBookingLock(booking.id, { depositStatus: DepositStatus.RELEASED })
    await release.lockHeld
    const filing = createDispute(booking.id, renter.id, 'ITEM_DAMAGED', 'The case came back cracked down one side.')
    await new Promise((r) => setTimeout(r, 300))
    release.release()
    await release.done

    await assert.rejects(filing, /already been resolved/)
    assert.equal(await getTestPrisma().dispute.count({ where: { bookingId: booking.id } }), 0)
  })
})
