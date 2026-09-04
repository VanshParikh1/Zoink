/**
 * Integration Tests — "Most Recent Activity" Sort Order
 * ========================================================
 * Covers the fix for completed/cancelled items sinking to the bottom of the
 * Bookings, Requests, and Listings screens because they were ordered by
 * createdAt (which never changes after creation) instead of the most recent
 * activity on the item.
 *
 * - getMyBookings / getIncomingRequests (bookingService.ts): now ordered by
 *   Booking.updatedAt desc, which bumps on every status transition via
 *   Prisma's @updatedAt on any update()/updateMany() write (verified
 *   separately against zoink_test — see the investigation for this task; no
 *   status-changing write path bypasses update()/updateMany(), so no
 *   underlying data-freshness bug needed fixing here).
 * - getIncomingRequests additionally keeps PENDING requests pinned above
 *   everything else (status:'asc' primary sort, an intentional
 *   actionable-items-first ordering unrelated to the recency bug) and only
 *   uses updatedAt as the tie-break within each status group.
 * - getMyListings (listingService.ts): ordered by the MOST RECENT associated
 *   Booking.updatedAt (an aggregate query, not the Listing's own updatedAt —
 *   editing a listing's price/description must NOT bump it up this list). A
 *   listing with zero bookings falls back to its own createdAt.
 *
 * Rows are written directly via Prisma (status + explicit updatedAt/createdAt)
 * rather than walked through the full state machine, so each scenario's
 * timestamps are deterministic and don't depend on wall-clock sleeps.
 */

import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  truncateAllTables,
  createTestUser,
  getTestPrisma,
  disconnectTestPrisma,
  checkStripeConnectivity,
} from './setup'
import * as bookingService from '../services/bookingService'
import * as listingService from '../services/listingService'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'

let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }

before(async () => {
  await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
})

after(async () => {
  await disconnectTestPrisma()
})

// Minutes-ago/from-now helper so every timestamp in a scenario is explicit
// and unambiguous relative to the others, without relying on real elapsed time.
function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60 * 1000)
}

async function makeListing(ownerId: string, overrides: { createdAt?: Date } = {}) {
  const db = getTestPrisma()
  return db.listing.create({
    data: {
      title: 'Sort Order Test Listing',
      description: 'test',
      category: 'Electronics',
      dailyPrice: new Prisma.Decimal(20),
      itemValue: new Prisma.Decimal(100),
      depositAmount: new Prisma.Decimal(0),
      isAvailable: true,
      latitude: 43.6629,
      longitude: -79.3957,
      city: 'Toronto',
      address: null,
      ownerId,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    },
  })
}

async function makeBooking(opts: {
  listingId: string
  renterId: string
  ownerId: string
  status: BookingStatus
  createdAt: Date
  updatedAt: Date
}) {
  const db = getTestPrisma()
  return db.booking.create({
    data: {
      listingId: opts.listingId,
      renterId: opts.renterId,
      ownerId: opts.ownerId,
      startDate: new Date(),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      totalPrice: new Prisma.Decimal(40),
      depositAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(6),
      ownerPayout: new Prisma.Decimal(34),
      insuranceFee: new Prisma.Decimal(0),
      status: opts.status,
      paymentStatus: PaymentStatus.AUTHORIZED,
      createdAt: opts.createdAt,
      updatedAt: opts.updatedAt,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
describe('getMyBookings — renter view sorted by most recent activity', () => {
  test('a booking created first but updated most recently (e.g. declined) sorts above a newer, untouched booking', async () => {
    const listing1 = await makeListing(owner.id)
    const listing2 = await makeListing(owner.id)

    // booking1 created first, but its status changed most recently (simulates
    // "declined an hour ago" for a booking that was originally requested
    // three hours ago).
    const booking1 = await makeBooking({
      listingId: listing1.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.DECLINED,
      createdAt: minutesAgo(180),
      updatedAt: minutesAgo(60),
    })
    // booking2 created more recently than booking1, and never touched since.
    const booking2 = await makeBooking({
      listingId: listing2.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.PENDING,
      createdAt: minutesAgo(90),
      updatedAt: minutesAgo(90),
    })

    const result = await bookingService.getMyBookings(renter.id)
    assert.deepEqual(result.map((b) => b.id), [booking1.id, booking2.id],
      'booking1 (older createdAt, newer updatedAt) must lead — createdAt-based sort would put booking2 first')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getIncomingRequests — owner view: PENDING pinned first, updatedAt breaks ties', () => {
  test('PENDING requests stay pinned above other statuses regardless of recency', async () => {
    const listing = await makeListing(owner.id)

    // A COMPLETED booking updated very recently...
    const completed = await makeBooking({
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.COMPLETED,
      createdAt: minutesAgo(300),
      updatedAt: minutesAgo(1),
    })
    // ...vs. a PENDING request that's comparatively stale.
    const pending = await makeBooking({
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.PENDING,
      createdAt: minutesAgo(200),
      updatedAt: minutesAgo(200),
    })

    const result = await bookingService.getIncomingRequests(owner.id)
    assert.deepEqual(result.map((b) => b.id), [pending.id, completed.id],
      'PENDING must lead even though the COMPLETED booking has the more recent updatedAt — status priority is a separate, intentional ordering')
  })

  test('within the same status group, the more recently updated booking leads', async () => {
    const listing = await makeListing(owner.id)

    const completedOld = await makeBooking({
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.COMPLETED,
      createdAt: minutesAgo(500),
      updatedAt: minutesAgo(400),
    })
    const completedRecent = await makeBooking({
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.COMPLETED,
      createdAt: minutesAgo(300), // created AFTER completedOld's updatedAt too
      updatedAt: minutesAgo(10),
    })

    const result = await bookingService.getIncomingRequests(owner.id)
    assert.deepEqual(result.map((b) => b.id), [completedRecent.id, completedOld.id],
      'within the COMPLETED group, most-recently-completed should lead, not most-recently-requested')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('getMyListings — sorted by most recent associated booking activity', () => {
  test('listings order by their most recent booking updatedAt; a booking-less listing falls back to its own createdAt', async () => {
    // listingNoBookings: very recent createdAt, zero bookings — should still
    // land near the top on createdAt alone, proving "no bookings" isn't
    // special-cased to the bottom.
    const listingNoBookings = await makeListing(owner.id, { createdAt: minutesAgo(2) })

    // listingHotActivity: old createdAt, but a booking updated more recently
    // than listingNoBookings was even created — must outrank everything on
    // activity, not age.
    const listingHotActivity = await makeListing(owner.id, { createdAt: minutesAgo(1000) })
    await makeBooking({
      listingId: listingHotActivity.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.COMPLETED,
      createdAt: minutesAgo(999),
      updatedAt: minutesAgo(1),
    })

    // listingStaleActivity: booking activity exists but is older than
    // listingNoBookings' own createdAt.
    const listingStaleActivity = await makeListing(owner.id, { createdAt: minutesAgo(800) })
    await makeBooking({
      listingId: listingStaleActivity.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.CANCELLED,
      createdAt: minutesAgo(700),
      updatedAt: minutesAgo(600),
    })

    const result = await listingService.getMyListings(owner.id)
    assert.deepEqual(
      result.map((l) => l.id),
      [listingHotActivity.id, listingNoBookings.id, listingStaleActivity.id],
      'order should be: most recent booking activity (5 min ago) > booking-less listing on its own createdAt (2 min ago) > stale booking activity (600 min ago)'
    )
  })

  test('editing a listing (bumping its own updatedAt) does not move it up the list', async () => {
    const db = getTestPrisma()
    const listingEdited = await makeListing(owner.id, { createdAt: minutesAgo(500) })
    const listingWithRecentBooking = await makeListing(owner.id, { createdAt: minutesAgo(400) })
    await makeBooking({
      listingId: listingWithRecentBooking.id,
      renterId: renter.id,
      ownerId: owner.id,
      status: BookingStatus.CONFIRMED,
      createdAt: minutesAgo(350),
      updatedAt: minutesAgo(300),
    })

    // Edit listingEdited's own price — this bumps Listing.updatedAt to "now",
    // which is far more recent than listingWithRecentBooking's booking
    // activity (300 min ago). If getMyListings ever regresses to ordering by
    // the Listing's own updatedAt, this would wrongly promote listingEdited.
    await db.listing.update({ where: { id: listingEdited.id }, data: { dailyPrice: new Prisma.Decimal(25) } })

    const result = await listingService.getMyListings(owner.id)
    assert.deepEqual(
      result.map((l) => l.id),
      [listingWithRecentBooking.id, listingEdited.id],
      'a listing with real booking activity must outrank one that was merely edited, even though the edit is the more recent write'
    )
  })
})
