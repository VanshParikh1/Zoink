/**
 * Integration Tests — account deletion with bookings in flight
 * ============================================================
 * Deleting an account is refused while an item is with someone (ACTIVE,
 * RETURN_PENDING) or a dispute is open, since the other person needs the
 * deleted account to finish. Bookings that never reached pickup are cancelled
 * instead, even after their start time. Runs in Stripe mock mode.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import { BookingStatus, DisputeReason, PaymentStatus, Prisma } from '@prisma/client'

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let listingId: string

async function booking(status: BookingStatus, startOffsetDays = 2) {
  const { startDate, endDate } = futureDates(startOffsetDays, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(40),
      status,
      paymentStatus: status === BookingStatus.PENDING ? PaymentStatus.PENDING_AUTH : PaymentStatus.AUTHORIZED,
      stripePaymentIntentId: `pi_mock_delete_${status}_${Date.now()}`,
    },
  })
}

const deleteAccount = (token: string) => supertest(getApp()).delete('/users/me').set('Authorization', `Bearer ${token}`)

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

after(async () => {
  await truncateAllTables()
  await disconnectTestPrisma()
})

describe('DELETE /users/me with bookings in flight', () => {
  for (const status of [BookingStatus.ACTIVE, BookingStatus.RETURN_PENDING]) {
    test(`is refused while a booking is ${status}, for either party`, async () => {
      await booking(status)
      for (const user of [renter, owner]) {
        const res = await deleteAccount(user.token)
        assert.equal(res.status, 409)
        assert.match(res.body.error, /current rentals/)
      }
      const rows = await getTestPrisma().user.findMany({ where: { id: { in: [renter.id, owner.id] } } })
      assert.ok(rows.every((u) => u.deletedAt === null))
    })
  }

  test('is refused while a completed booking has an open dispute', async () => {
    const b = await booking(BookingStatus.COMPLETED, -5)
    await getTestPrisma().dispute.create({
      data: { bookingId: b.id, raisedByUserId: owner.id, reason: DisputeReason.ITEM_DAMAGED, description: 'Scratched lens' },
    })
    assert.equal((await deleteAccount(renter.token)).status, 409)
  })

  test('cancels bookings that never reached pickup, even past their start time, then deletes', async () => {
    const early = await Promise.all([
      booking(BookingStatus.PENDING),
      booking(BookingStatus.ACCEPTED),
      booking(BookingStatus.CONFIRMED),
      booking(BookingStatus.PICKUP_PENDING, 0),
    ])
    const done = await booking(BookingStatus.COMPLETED, -5)

    assert.equal((await deleteAccount(renter.token)).status, 204)

    const db = getTestPrisma()
    for (const b of early) {
      assert.equal((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status, BookingStatus.CANCELLED)
    }
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: done.id } })).status, BookingStatus.COMPLETED)
    assert.ok((await db.user.findUniqueOrThrow({ where: { id: renter.id } })).deletedAt)
  })
})
