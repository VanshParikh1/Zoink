/**
 * Integration Tests — the handoff records when, and keeps the booked days
 * =====================================================================
 * Pickup and return write pickedUpAt / returnedAt. startDate and endDate stay
 * the booked days, so the overlap check keeps seeing a rental that is out,
 * even a one-day rental picked up in the evening (when the UTC day has
 * already moved on).
 */
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  getTestPrisma,
  disconnectTestPrisma,
  handoffPhotoUrl,
} from './setup'
import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import { torontoDayKey } from '@zoink/shared'
import * as paymentService from '../services/paymentService'
import * as handoffService from '../services/handoffService'
import * as bookingService from '../services/bookingService'

let owner: { id: string }
let renter: { id: string }
let other: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_dates' })
  renter = await createTestUser({ firstName: 'Renter' })
  other = await createTestUser({ firstName: 'Other' })
  listingId = (await createTestListing(owner.id)).id
  mock.method(paymentService, 'capturePaymentIntent', async (b: any) => ({ id: b.stripePaymentIntentId, status: 'succeeded', latest_charge: 'ch_dates' }))
  mock.method(paymentService, 'getConnectAccountStatus', async () => ({ connected: true, chargesEnabled: true, detailsSubmitted: true, payoutsEnabled: true }))
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

const today = () => new Date(`${torontoDayKey()}T00:00:00.000Z`)

async function confirmedOneDayBooking() {
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: today(),
      endDate: today(),
      totalPrice: new Prisma.Decimal(10),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.AUTHORIZED,
      stripePaymentIntentId: 'pi_dates',
    },
  })
}

async function pickUp(bookingId: string) {
  await handoffService.initiateHandoff(bookingId, owner.id, 'pickup', [handoffPhotoUrl(bookingId, 'a'), handoffPhotoUrl(bookingId, 'b')])
  await handoffService.confirmHandoff(bookingId, owner.id, 'pickup')
  await handoffService.confirmHandoff(bookingId, renter.id, 'pickup')
}

describe('handoff dates', () => {
  test('pickup and return set pickedUpAt and returnedAt and leave the booked days alone', async () => {
    const booking = await confirmedOneDayBooking()
    await pickUp(booking.id)
    const active = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(active.status, BookingStatus.ACTIVE)
    assert.ok(active.pickedUpAt)
    assert.equal(active.startDate.toISOString(), booking.startDate.toISOString())

    await handoffService.initiateHandoff(booking.id, renter.id, 'return', [handoffPhotoUrl(booking.id, 'c'), handoffPhotoUrl(booking.id, 'd')])
    await handoffService.confirmHandoff(booking.id, renter.id, 'return')
    const done = await handoffService.confirmHandoff(booking.id, owner.id, 'return')
    assert.equal(done.booking.status, BookingStatus.COMPLETED)
    assert.ok(done.booking.returnedAt)
    assert.ok(done.booking.pickedUpAt)
    assert.equal(new Date(done.booking.endDate).toISOString(), booking.endDate.toISOString())
  })

  test('a one-day rental picked up in the evening still holds its day against another request', async () => {
    // 22:30 Toronto: under the old code startDate became tomorrow's UTC day,
    // after the booked endDate, and the overlap check stopped seeing it.
    const booking = await confirmedOneDayBooking()
    const evening = new Date(`${torontoDayKey()}T03:30:00.000Z`)
    evening.setUTCDate(evening.getUTCDate() + 1)
    mock.timers.enable({ apis: ['Date'], now: evening.getTime() })
    try {
      await pickUp(booking.id)
    } finally {
      mock.timers.reset()
    }

    const request = await getTestPrisma().booking.create({
      data: { listingId, renterId: other.id, ownerId: owner.id, startDate: today(), endDate: today(), totalPrice: new Prisma.Decimal(10) },
    })
    await assert.rejects(
      bookingService.transitionBookingStatus(request.id, owner.id, 'ACCEPTED'),
      /overlap with another accepted booking/
    )
  })
})
