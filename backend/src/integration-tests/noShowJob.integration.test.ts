/**
 * Integration Tests — no-show auto-cancel (F-04 / D-3)
 * ====================================================
 * A CONFIRMED or PICKUP_PENDING booking not picked up by the end of its start
 * day (Toronto) + 12 h is cancelled, both holds are released, no one is
 * charged and both parties are notified. Stripe is mocked on the
 * paymentService module, as in jobRaces.
 */
import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { truncateAllTables, createTestUser, createTestListing, getTestPrisma, disconnectTestPrisma } from './setup'
import * as paymentService from '../services/paymentService'
import { cancelNoShows } from '../services/cleanupJob'
import { BookingStatus, DepositStatus, PaymentStatus, Prisma } from '@prisma/client'

let owner: { id: string }
let renter: { id: string }
let listingId: string

// Starts Nov 10 2026: the deadline is 12:00 EST Nov 11 = 17:00 UTC.
const START = new Date('2026-11-10T00:00:00.000Z')
const DEADLINE = new Date('2026-11-11T17:00:00.000Z')

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { title: 'Tent' })).id
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

function paidBooking(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: START,
      endDate: new Date('2026-11-11T00:00:00.000Z'),
      totalPrice: new Prisma.Decimal(40),
      depositAmount: new Prisma.Decimal(20),
      commissionAmount: new Prisma.Decimal(6),
      ownerPayout: new Prisma.Decimal(34),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.AUTHORIZED,
      stripePaymentIntentId: `pi_noshow_${Math.random().toString(36).slice(2)}`,
      depositStatus: DepositStatus.AUTHORIZED,
      stripeDepositPaymentIntentId: `pi_dep_noshow_${Math.random().toString(36).slice(2)}`,
      version: 1,
      ...overrides,
    },
  })
}

function mockStripe(delayMs = 0) {
  const rent = mock.method(paymentService, 'cancelPaymentIntent', async (b: { stripePaymentIntentId: string }) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    return { id: b.stripePaymentIntentId, status: 'canceled' }
  })
  const deposit = mock.method(paymentService, 'cancelDepositPaymentIntent', async (b: { stripeDepositPaymentIntentId: string }) => ({
    id: b.stripeDepositPaymentIntentId,
    status: 'canceled',
  }))
  return { rent, deposit }
}

/** Holds the booking's row lock (as a pickup would) and applies `change` inside it. */
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
    { timeout: 20_000 },
  )
  return { lockHeld, release, done }
}

describe('cancelNoShows', () => {
  test('cancels at the deadline, releases both holds and tells both parties; not a second earlier', async () => {
    const booking = await paidBooking()
    const stripe = mockStripe()

    const early = await cancelNoShows(new Date(DEADLINE.getTime() - 1000))
    assert.equal(early.cancelled, 0)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CONFIRMED)

    const result = await cancelNoShows(DEADLINE)
    assert.equal(result.cancelled, 1)
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.status, BookingStatus.CANCELLED)
    assert.equal(after.paymentStatus, PaymentStatus.REFUND_PENDING)
    assert.equal(after.depositStatus, DepositStatus.RELEASED)
    assert.equal(after.paidAt, null, 'nothing captured')
    assert.equal(stripe.rent.mock.callCount(), 1)
    assert.equal(stripe.deposit.mock.callCount(), 1)

    const event = await getTestPrisma().bookingEvent.findFirstOrThrow({ where: { bookingId: booking.id, type: 'STATUS_CHANGE' } })
    assert.equal((event.metadata as any).reason, 'no_show')

    await new Promise((r) => setTimeout(r, 200)) // notifyUser is fire-and-forget
    const notified = await getTestPrisma().notification.findMany({ where: { type: 'BOOKING_CANCELLED' } })
    assert.deepEqual(notified.map((n) => n.userId).sort(), [owner.id, renter.id].sort())
  })

  test('PICKUP_PENDING is cancelled too; a booking without a deposit releases only the rent', async () => {
    const pending = await paidBooking({ status: BookingStatus.PICKUP_PENDING })
    const noDeposit = await paidBooking({ depositAmount: new Prisma.Decimal(0), depositStatus: null, stripeDepositPaymentIntentId: null })
    const stripe = mockStripe()

    assert.equal((await cancelNoShows(DEADLINE)).cancelled, 2)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: pending.id } })).status, BookingStatus.CANCELLED)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: noDeposit.id } })).status, BookingStatus.CANCELLED)
    assert.equal(stripe.rent.mock.callCount(), 2)
    assert.equal(stripe.deposit.mock.callCount(), 1)
  })

  test('leaves other statuses alone', async () => {
    const stripe = mockStripe()
    const ids = []
    for (const status of [BookingStatus.ACTIVE, BookingStatus.RETURN_PENDING, BookingStatus.COMPLETED, BookingStatus.ACCEPTED, BookingStatus.PENDING]) {
      ids.push((await paidBooking({ status })).id)
    }
    assert.equal((await cancelNoShows(new Date(DEADLINE.getTime() + 86_400_000))).cancelled, 0)
    assert.equal(stripe.rent.mock.callCount(), 0)
    const statuses = (await getTestPrisma().booking.findMany({ where: { id: { in: ids } } })).map((b) => b.status)
    assert.ok(!statuses.includes(BookingStatus.CANCELLED))
  })

  test('two overlapping runs cancel once', async () => {
    const booking = await paidBooking()
    const stripe = mockStripe(50)
    const [a, b] = await Promise.all([cancelNoShows(DEADLINE), cancelNoShows(DEADLINE)])
    assert.equal(a.cancelled + b.cancelled, 1)
    assert.equal(stripe.rent.mock.callCount(), 1)
    assert.equal(stripe.deposit.mock.callCount(), 1)
    const events = await getTestPrisma().bookingEvent.findMany({ where: { bookingId: booking.id, type: 'STATUS_CHANGE' } })
    assert.equal(events.length, 1)
  })

  test('a pickup completing while the job runs wins; the job then leaves it alone', async () => {
    const booking = await paidBooking({ status: BookingStatus.PICKUP_PENDING })
    const stripe = mockStripe()
    const pickup = holdBookingLock(booking.id, { status: BookingStatus.ACTIVE, paymentStatus: PaymentStatus.CAPTURED, paidAt: new Date() })
    await pickup.lockHeld
    const job = cancelNoShows(DEADLINE)
    await new Promise((r) => setTimeout(r, 300))
    pickup.release()
    await pickup.done
    const result = await job

    assert.equal(result.cancelled, 0)
    assert.equal(stripe.rent.mock.callCount(), 0)
    assert.equal(stripe.deposit.mock.callCount(), 0)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.ACTIVE)
  })

  test('a Stripe failure leaves the booking as it was, records it, and the next run retries', async () => {
    const booking = await paidBooking()
    mock.method(paymentService, 'cancelPaymentIntent', async () => {
      throw new Error('Stripe is down')
    })
    const first = await cancelNoShows(DEADLINE)
    assert.equal(first.failed, 1)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(row.status, BookingStatus.CONFIRMED)
    assert.equal(row.depositStatus, DepositStatus.AUTHORIZED)
    assert.ok(await getTestPrisma().bookingEvent.findFirst({ where: { bookingId: booking.id, type: 'ERROR' } }))

    mock.restoreAll()
    mockStripe()
    assert.equal((await cancelNoShows(DEADLINE)).cancelled, 1)
  })

  test('a booking whose rent was somehow captured is not cancelled', async () => {
    const booking = await paidBooking({ paidAt: new Date(), paymentStatus: PaymentStatus.CAPTURED })
    const stripe = mockStripe()
    const result = await cancelNoShows(DEADLINE)
    assert.equal(result.failed, 1)
    assert.equal(stripe.rent.mock.callCount(), 0)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).status, BookingStatus.CONFIRMED)
  })
})
