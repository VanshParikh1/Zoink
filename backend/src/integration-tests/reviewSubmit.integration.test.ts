/**
 * Integration Tests — submitting a review twice
 * =============================================
 * A double tap sends the same review twice at once. One is stored; the other
 * is told it was already submitted (409), never a 500.
 */
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  getApp,
} from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, PaymentStatus, Prisma, ReviewRole } from '@prisma/client'

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let obligationId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  const listing = await createTestListing(owner.id)
  const { startDate, endDate } = futureDates(3, 2)
  const db = getTestPrisma()
  const booking = await db.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(30),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID_OUT,
      completedAt: new Date(),
    },
  })
  obligationId = (
    await db.reviewObligation.create({
      data: { bookingId: booking.id, userId: renter.id, targetUserId: owner.id, reviewerRole: ReviewRole.RENTER },
    })
  ).id
})

after(async () => disconnectTestPrisma())

describe('POST /reviews', () => {
  test('two identical submissions at once store one review; the other gets 409', async () => {
    const body = { obligationId, reviewerRole: 'RENTER', scoreA: 5, scoreB: 4, scoreC: 5, itemRating: 5 }
    const send = () => supertest(getApp()).post('/reviews').set('Authorization', `Bearer ${renter.token}`).send(body)
    const statuses = (await Promise.all([send(), send(), send()])).map((r) => r.status).sort()
    assert.deepEqual(statuses, [201, 409, 409])
    assert.equal(await getTestPrisma().review.count(), 1)
  })
})
