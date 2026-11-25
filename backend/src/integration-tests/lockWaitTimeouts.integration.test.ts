/**
 * Integration Tests — P2-2 / P3-9: waiting behind the booking lock
 * =================================================================
 * Pay and Confirm hold a booking's row lock across a Stripe call for up to
 * ~27 s. Every other transaction that takes that lock must wait it out with the
 * same 30 s budget, not Prisma's 5 s default. Each test holds the lock for 9 s
 * (over the default, under the budget) and checks the waiter still succeeds.
 */
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, checkStripeConnectivity, getApp } from './setup'
import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, DepositStatus, DisputeStatus, PaymentStatus, Prisma, Role } from '@prisma/client'
import prisma from '../utils/prisma'
import { createDispute, resolveDispute } from '../services/disputeService'
import { flagOverdueRentals } from '../services/cleanupJob'

const HOLD_MS = 9_000

let owner: { id: string; token: string }
let renter: { id: string }
let admin: { id: string }
let listingId: string
let stripeAvailable = false

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID ?? null })
  renter = await createTestUser({ firstName: 'Renter' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  listingId = (await createTestListing(owner.id)).id
})

after(async () => disconnectTestPrisma())

function booking(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  const { startDate, endDate } = futureDates(5, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(40),
      commissionAmount: new Prisma.Decimal(6),
      ownerPayout: new Prisma.Decimal(34),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.AUTHORIZED,
      depositStatus: DepositStatus.AUTHORIZED,
      ...overrides,
    },
  })
}

/** Holds the booking's row lock for HOLD_MS, like a Confirm waiting on Stripe. */
async function holdLock(bookingId: string) {
  let locked!: () => void
  const isLocked = new Promise<void>((r) => (locked = r))
  const done = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    locked()
    await new Promise((r) => setTimeout(r, HOLD_MS))
  }, { timeout: HOLD_MS + 10_000 })
  await isLocked
  return { done }
}

async function waitsOut<T>(bookingId: string, work: () => Promise<T>) {
  const { done: holder } = await holdLock(bookingId)
  const started = Date.now()
  const result = await work()
  assert.ok(Date.now() - started >= HOLD_MS - 1500, `it really waited for the lock (${Date.now() - started} ms)`)
  await holder
  return result
}

describe('transactions that wait behind the booking lock use the 30 s budget', () => {
  test('filing a dispute', async () => {
    const b = await booking()
    const dispute = await waitsOut(b.id, () => createDispute(b.id, renter.id, 'OTHER', 'The owner stopped answering messages.'))
    assert.equal(dispute.status, DisputeStatus.OPEN)
  })

  test('resolving a dispute', async () => {
    const b = await booking()
    const dispute = await createDispute(b.id, renter.id, 'OTHER', 'The owner stopped answering messages.')
    const resolved = await waitsOut(b.id, () => resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_NO_ACTION, 'Sorted out by chat.'))
    assert.equal(resolved.status, DisputeStatus.RESOLVED_NO_ACTION)
  })

  test('the overdue flag job', async () => {
    const b = await booking({ status: BookingStatus.ACTIVE, paymentStatus: PaymentStatus.CAPTURED, endDate: new Date('2026-11-12T00:00:00.000Z'), startDate: new Date('2026-11-10T00:00:00.000Z') })
    const result = await waitsOut(b.id, () => flagOverdueRentals(new Date('2026-11-15T00:00:00.000Z')))
    assert.equal(result.flagged, 1)
  })

  test('accepting a request', async (t) => {
    if (!stripeAvailable || !process.env.DEV_STRIPE_ACCOUNT_ID) return t.skip('needs Stripe test mode and DEV_STRIPE_ACCOUNT_ID')
    const b = await booking({ status: BookingStatus.PENDING, paymentStatus: PaymentStatus.PENDING_AUTH, depositStatus: null })
    const res = await waitsOut(b.id, () => supertest(getApp()).patch(`/bookings/${b.id}/accept`).set('Authorization', `Bearer ${owner.token}`))
    assert.equal(res.status, 200, JSON.stringify(res.body))
  })
})
