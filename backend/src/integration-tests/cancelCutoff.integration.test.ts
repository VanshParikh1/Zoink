/**
 * Integration Tests — Cancellation closes at 00:00 Toronto on the rental day
 * ==========================================================================
 * terms.md §9: a booking can't be cancelled once the rental start time has
 * passed. A rental day is stored as midnight UTC, which is 8 PM (EDT) or 7 PM
 * (EST) the evening before in Toronto; the cutoff used to be that instant.
 * It's now 00:00 America/Toronto on the rental day, including on the two DST
 * change days.
 *
 * The clock is mocked (Date only) around each cancel call, so these are
 * deterministic whatever time the suite runs.
 */

import test, { after, afterEach, beforeEach, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { BookingStatus, Prisma } from '@prisma/client'
import {
  createTestListing,
  createTestUser,
  disconnectTestPrisma,
  getTestPrisma,
  truncateAllTables,
} from './setup'
import * as bookingService from '../services/bookingService'

let owner: { id: string }
let renter: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { dailyPrice: 20 })).id
})

afterEach(() => {
  mock.timers.reset()
})

after(async () => {
  await disconnectTestPrisma()
})

/** A PENDING request for `day` (YYYY-MM-DD), stored the way the app sends it. */
async function requestFor(day: string) {
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(`${day}T00:00:00.000Z`),
      endDate: new Date(`${day}T00:00:00.000Z`),
      totalPrice: new Prisma.Decimal(20),
      depositAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(3),
      ownerPayout: new Prisma.Decimal(17),
      insuranceFee: new Prisma.Decimal(0),
      hstAmount: new Prisma.Decimal(2.6),
      status: BookingStatus.PENDING,
    },
  })
}

async function cancelAt(bookingId: string, nowIso: string) {
  mock.timers.enable({ apis: ['Date'], now: new Date(nowIso) })
  try {
    return await bookingService.transitionBookingStatus(bookingId, renter.id, 'CANCELLED')
  } finally {
    mock.timers.reset()
  }
}

async function assertCancellable(day: string, nowIso: string) {
  const booking = await requestFor(day)
  const result = await cancelAt(booking.id, nowIso)
  assert.equal(result.status, BookingStatus.CANCELLED, `${day} should still be cancellable at ${nowIso}`)
}

async function assertClosed(day: string, nowIso: string) {
  const booking = await requestFor(day)
  await assert.rejects(cancelAt(booking.id, nowIso), (error: any) => {
    assert.equal(error.statusCode, 409)
    assert.match(error.message, /can no longer be cancelled/)
    return true
  })
  const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
  assert.equal(after.status, BookingStatus.PENDING)
}

describe('summer (EDT, UTC-4)', () => {
  test('still cancellable at 10:30 PM the evening before (refused before this fix)', async () => {
    await assertCancellable('2026-10-20', '2026-10-20T02:30:00.000Z')
  })
  test('still cancellable at 11:59:59 PM the evening before', async () => {
    await assertCancellable('2026-10-20', '2026-10-20T03:59:59.000Z')
  })
  test('closed at 00:00 Toronto on the rental day', async () => {
    await assertClosed('2026-10-20', '2026-10-20T04:00:00.000Z')
  })
})

describe('winter (EST, UTC-5)', () => {
  test('still cancellable at 7:30 PM the evening before (refused before this fix)', async () => {
    await assertCancellable('2026-12-05', '2026-12-05T00:30:00.000Z')
  })
  test('closed at 00:00 Toronto on the rental day', async () => {
    await assertClosed('2026-12-05', '2026-12-05T05:00:00.000Z')
  })
})

describe('rentals starting on a DST change day', () => {
  test('spring forward (2026-03-08): the day still starts on EST', async () => {
    await assertCancellable('2026-03-08', '2026-03-08T04:59:59.000Z')
    await assertClosed('2026-03-08', '2026-03-08T05:00:00.000Z')
  })
  test('the day after spring forward starts on EDT', async () => {
    await assertCancellable('2026-03-09', '2026-03-09T03:59:59.000Z')
    await assertClosed('2026-03-09', '2026-03-09T04:00:00.000Z')
  })
  test('fall back (2026-11-01): the day still starts on EDT', async () => {
    await assertCancellable('2026-11-01', '2026-11-01T03:59:59.000Z')
    await assertClosed('2026-11-01', '2026-11-01T04:00:00.000Z')
  })
  test('the day after fall back starts on EST', async () => {
    await assertCancellable('2026-11-02', '2026-11-02T04:59:59.000Z')
    await assertClosed('2026-11-02', '2026-11-02T05:00:00.000Z')
  })
})
