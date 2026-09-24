/**
 * Integration Tests — list endpoints carry only a listing's first image
 * ====================================================================
 * Every list screen in the app renders only `images[0]` (the thumbnail); the
 * detail screens re-fetch by id and render the full gallery. List responses
 * therefore send just the first image (lowest `order`); detail responses are
 * unchanged.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  getApp,
} from './setup'
import { BookingStatus, Prisma, ReviewRole } from '@prisma/client'

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let listingId: string
let bookingId: string
let conversationId: string

beforeEach(async () => {
  await truncateAllTables()
  const db = getTestPrisma()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
  // Inserted out of order on purpose: "first" means lowest `order`.
  await db.listingImage.createMany({
    data: [2, 0, 1].map((order) => ({
      listingId,
      url: `https://res.cloudinary.com/test/image/upload/listings/img${order}.jpg`,
      order,
    })),
  })
  conversationId = (await db.conversation.create({ data: { listingId, renterId: renter.id, ownerId: owner.id } })).id
  const { startDate, endDate } = futureDates(3, 2)
  bookingId = (
    await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        conversationId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(20),
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
      },
    })
  ).id
  await db.reviewObligation.create({
    data: { bookingId, userId: renter.id, targetUserId: owner.id, reviewerRole: ReviewRole.RENTER },
  })
})

after(async () => {
  await disconnectTestPrisma()
})

const get = (path: string, token: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`)

function assertFirstImageOnly(images: { url: string; order: number }[], where: string) {
  assert.equal(images.length, 1, `${where}: expected only the first image`)
  assert.equal(images[0].order, 0, `${where}: the first image is the lowest order`)
}

describe('list responses', () => {
  test('carry only the first listing image', async () => {
    const browse = await get('/listings', renter.token)
    assert.equal(browse.status, 200)
    assertFirstImageOnly(browse.body.items[0].images, 'GET /listings')

    const mine = await get('/listings/me', owner.token)
    assertFirstImageOnly(mine.body[0].images, 'GET /listings/me')

    const bookings = await get('/bookings/me', renter.token)
    assertFirstImageOnly(bookings.body[0].listing.images, 'GET /bookings/me')

    const requests = await get('/bookings/requests', owner.token)
    assertFirstImageOnly(requests.body[0].listing.images, 'GET /bookings/requests')

    const inbox = await get('/conversations/me', renter.token)
    assertFirstImageOnly(inbox.body[0].listing.images, 'GET /conversations/me')

    const pending = await get('/reviews/pending', renter.token)
    assertFirstImageOnly(pending.body[0].booking.listing.images, 'GET /reviews/pending')
  })
})

describe('detail responses', () => {
  test('still carry every image, in order', async () => {
    const orders = (images: { order: number }[]) => images.map((i) => i.order)

    const listing = await get(`/listings/${listingId}`, renter.token)
    assert.deepEqual(orders(listing.body.images), [0, 1, 2])

    const booking = await get(`/bookings/${bookingId}`, renter.token)
    assert.deepEqual(orders(booking.body.listing.images), [0, 1, 2])

    const conversation = await get(`/conversations/${conversationId}`, renter.token)
    assert.deepEqual(orders(conversation.body.listing.images), [0, 1, 2])
  })
})
