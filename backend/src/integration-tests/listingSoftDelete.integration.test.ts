/**
 * Integration Tests — deleting a listing that has history
 * ========================================================
 * Conversations and bookings reference their listing (and bookings are kept
 * 7 years), so a listing anyone had messaged about or booked couldn't be
 * deleted: DELETE /listings/:id answered 500 and the app said "Could not
 * delete listing." Owner decision (2026-10-19): soft-delete it. It disappears
 * from browse, search and the owner's list, its photos are deleted from
 * Cloudinary, it takes no new bookings, conversations or edits, and the
 * bookings and chats about it keep its title and price. A booking still in
 * progress blocks the delete with a readable 409. A listing with no history
 * is still deleted outright (cloudinaryCleanup.integration.test.ts).
 *
 * Cloudinary's destroy call is mocked; nothing leaves the machine.
 */

import test, { after, afterEach, beforeEach, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, Prisma } from '@prisma/client'
import { v2 as cloudinarySdk } from 'cloudinary'
import {
  createTestListing,
  createTestUser,
  disconnectTestPrisma,
  futureDates,
  getApp,
  getTestPrisma,
  truncateAllTables,
} from './setup'

type U = { id: string; token: string }
let owner: U
let renter: U
let listingId: string
let destroyed: string[]

const TITLE = 'Soft Delete Camera'
const own = (path: string) => `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/v1712345678/${path}.jpg`

const as = (token: string) => ({
  get: (path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string) => supertest(getApp()).post(path).set('Authorization', `Bearer ${token}`),
  patch: (path: string) => supertest(getApp()).patch(path).set('Authorization', `Bearer ${token}`),
  delete: (path: string) => supertest(getApp()).delete(path).set('Authorization', `Bearer ${token}`),
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { title: TITLE, dailyPrice: 12.5 })).id
  await getTestPrisma().listingImage.createMany({
    data: [
      { listingId, url: own('listings/sd1'), order: 0 },
      { listingId, url: own('listings/sd2'), order: 1 },
    ],
  })
  destroyed = []
  mock.method(cloudinarySdk.uploader, 'destroy', async (publicId: string) => {
    destroyed.push(publicId)
    return { result: 'ok' }
  })
})

afterEach(() => {
  mock.restoreAll()
})

after(async () => {
  await disconnectTestPrisma()
})

async function openConversation() {
  return getTestPrisma().conversation.create({ data: { listingId, renterId: renter.id, ownerId: owner.id } })
}

async function createBooking(status: BookingStatus) {
  const { startDate, endDate } = futureDates(3, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(25),
      depositAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(3.75),
      ownerPayout: new Prisma.Decimal(21.25),
      insuranceFee: new Prisma.Decimal(0),
      hstAmount: new Prisma.Decimal(3.25),
      status,
    },
  })
}

describe('a listing someone has messaged about or booked', () => {
  test('with a conversation: deleted for the owner, kept as a record, photos removed', async () => {
    await openConversation()

    const res = await as(owner.token).delete(`/listings/${listingId}`)

    assert.equal(res.status, 204, JSON.stringify(res.body))
    const row = await getTestPrisma().listing.findUniqueOrThrow({ where: { id: listingId } })
    assert.ok(row.deletedAt, 'deletedAt is set')
    assert.equal(row.isAvailable, false)
    assert.equal(await getTestPrisma().listingImage.count({ where: { listingId } }), 0)
    assert.deepEqual(destroyed.sort(), ['listings/sd1', 'listings/sd2'])
  })

  test('with a finished booking: the booking keeps its title and prices', async () => {
    const booking = await createBooking(BookingStatus.COMPLETED)
    const before = (await as(renter.token).get(`/bookings/${booking.id}`)).body

    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)

    for (const viewer of [renter, owner]) {
      const detail = await as(viewer.token).get(`/bookings/${booking.id}`)
      assert.equal(detail.status, 200, JSON.stringify(detail.body))
      assert.equal(detail.body.listing.title, TITLE)
      assert.equal(detail.body.listing.dailyPrice, before.listing.dailyPrice)
      for (const field of ['totalPrice', 'hstAmount', 'commissionAmount', 'ownerPayout', 'depositAmount']) {
        assert.equal(detail.body[field], before[field], field)
      }
      assert.deepEqual(detail.body.listing.images, [], 'no link to a deleted photo')
    }

    const rentals = await as(renter.token).get('/bookings/me')
    assert.equal(rentals.body.find((b: { id: string }) => b.id === booking.id)?.listing.title, TITLE)
    const requests = await as(owner.token).get('/bookings/requests')
    assert.equal(requests.body.find((b: { id: string }) => b.id === booking.id)?.listing.title, TITLE)
  })

  test('chats about it stay readable and open', async () => {
    const conversation = await openConversation()
    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)

    const inbox = await as(renter.token).get('/conversations/me')
    assert.equal(inbox.status, 200)
    assert.ok(JSON.stringify(inbox.body).includes(TITLE), 'inbox still names the listing')
    const sent = await as(renter.token).post(`/conversations/${conversation.id}/messages`).send({ body: 'About the return…' })
    assert.equal(sent.status, 201, JSON.stringify(sent.body))
  })

  test('is hidden from browse, search, categories, the owner\'s list and its own page', async () => {
    await openConversation()
    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)

    for (const path of ['/listings', `/listings?q=${encodeURIComponent('Soft Delete')}`, '/listings?includeUnavailable=true']) {
      const res = await as(renter.token).get(path)
      assert.equal(res.status, 200)
      assert.ok(!JSON.stringify(res.body).includes(listingId), `${path} hides it`)
    }
    assert.deepEqual((await as(renter.token).get('/listings/categories')).body.categories, [])
    assert.deepEqual((await as(owner.token).get('/listings/me')).body, [])
    assert.equal((await as(renter.token).get(`/listings/${listingId}`)).status, 404)
    assert.equal((await as(owner.token).get(`/listings/${listingId}`)).status, 404)
  })

  test('takes no new bookings, conversations, edits or photos', async () => {
    await openConversation()
    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)
    const stranger = await createTestUser({ firstName: 'Stranger' })
    const { startDate, endDate } = futureDates(5, 2)

    assert.equal((await as(renter.token).post('/bookings').send({ listingId, startDate, endDate })).status, 404)
    assert.equal((await as(stranger.token).post('/conversations').send({ listingId })).status, 404)
    assert.equal((await as(owner.token).patch(`/listings/${listingId}`).send({ title: 'Back again' })).status, 404)
    assert.equal((await as(owner.token).patch(`/listings/${listingId}/availability`).send({ isAvailable: true })).status, 404)
    const upload = await as(owner.token)
      .post(`/listings/${listingId}/images`)
      .attach('image', Buffer.from('89504e470d0a1a0a', 'hex'), { filename: 'p.png', contentType: 'image/png' })
    assert.equal(upload.status, 404)

    assert.equal(await getTestPrisma().booking.count(), 0)
    assert.equal(await getTestPrisma().conversation.count(), 1)
    const row = await getTestPrisma().listing.findUniqueOrThrow({ where: { id: listingId } })
    assert.equal(row.title, TITLE)
    assert.equal(row.isAvailable, false)
  })

  test('deleting it again is a no-op for the owner and a 404 for anyone else', async () => {
    await openConversation()
    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)
    destroyed = []

    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)
    assert.equal((await as(renter.token).delete(`/listings/${listingId}`)).status, 404)
    assert.deepEqual(destroyed, [])
  })
})

describe('a booking still in progress blocks the delete', () => {
  const open: BookingStatus[] = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'PICKUP_PENDING', 'ACTIVE', 'RETURN_PENDING']
  for (const status of open) {
    test(`${status}: 409 with a readable message, nothing changed`, async () => {
      await createBooking(status)

      const res = await as(owner.token).delete(`/listings/${listingId}`)

      assert.equal(res.status, 409, JSON.stringify(res.body))
      assert.match(res.body.error, /booking that isn't finished yet/)
      const row = await getTestPrisma().listing.findUniqueOrThrow({ where: { id: listingId } })
      assert.equal(row.deletedAt, null)
      assert.equal(row.isAvailable, true)
      assert.equal(await getTestPrisma().listingImage.count({ where: { listingId } }), 2)
      assert.deepEqual(destroyed, [])
    })
  }

  test('finished bookings (completed, cancelled, declined) do not block it', async () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'DECLINED'] as BookingStatus[]) await createBooking(status)
    assert.equal((await as(owner.token).delete(`/listings/${listingId}`)).status, 204)
    assert.ok((await getTestPrisma().listing.findUniqueOrThrow({ where: { id: listingId } })).deletedAt)
  })
})

describe('a booking request racing the delete', () => {
  test('a request that arrives while the delete is committing waits for it, then gets a 404', async () => {
    await openConversation()
    const { Client } = require('pg')
    const deleter = new Client({ connectionString: process.env.DATABASE_URL })
    await deleter.connect()
    try {
      // What deleteListing does, held open: the request reads the listing as
      // still listed (the delete hasn't committed), then has to wait for it.
      await deleter.query('BEGIN')
      await deleter.query('SELECT id FROM listings WHERE id = $1 FOR UPDATE', [listingId])
      await deleter.query('UPDATE listings SET "deletedAt" = now(), "isAvailable" = false WHERE id = $1', [listingId])

      const { startDate, endDate } = futureDates(4, 2)
      const pending = as(renter.token).post('/bookings').send({ listingId, startDate, endDate }).then((r) => r)
      await new Promise((resolve) => setTimeout(resolve, 300))
      await deleter.query('COMMIT')

      const request = await pending
      assert.equal(request.status, 404, JSON.stringify(request.body))
      assert.equal(await getTestPrisma().booking.count(), 0)
    } finally {
      await deleter.end()
    }
  })

  test('either the request lands and the delete is refused, or the listing is gone and the request is a 404', async () => {
    await openConversation()
    for (let round = 0; round < 6; round++) {
      if (round > 0) {
        await getTestPrisma().booking.deleteMany()
        await getTestPrisma().listing.update({ where: { id: listingId }, data: { deletedAt: null, isAvailable: true } })
      }
      const { startDate, endDate } = futureDates(4 + round, 2)
      const [request, removal] = await Promise.all([
        as(renter.token).post('/bookings').send({ listingId, startDate, endDate }),
        as(owner.token).delete(`/listings/${listingId}`),
      ])

      const row = await getTestPrisma().listing.findUniqueOrThrow({ where: { id: listingId } })
      if (request.status === 201) {
        assert.equal(removal.status, 409, `round ${round}: ${JSON.stringify(removal.body)}`)
        assert.equal(row.deletedAt, null)
      } else {
        assert.equal(request.status, 404, `round ${round}: ${JSON.stringify(request.body)}`)
        assert.equal(removal.status, 204)
        assert.ok(row.deletedAt)
        assert.equal(await getTestPrisma().booking.count(), 0)
      }
    }
  })
})
