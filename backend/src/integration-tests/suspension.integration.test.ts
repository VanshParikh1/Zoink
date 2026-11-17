/**
 * Integration Tests — suspended accounts (D-9)
 * ============================================
 * A suspended user can't create listings, bookings, conversations, messages,
 * reports or disputes, and their listings are hidden from browse. They can
 * still read their data and finish an existing booking.
 */
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  getApp,
  handoffPhotoUrl,
} from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, PaymentStatus, Prisma, Role } from '@prisma/client'

let admin: { id: string; token: string }
let owner: { id: string; email: string; token: string }
let renter: { id: string; token: string }
let listingId: string
let conversationId: string
let messageId: string

const SUSPENDED = /Your account is suspended/

beforeEach(async () => {
  await truncateAllTables()
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { title: 'Suspended owner tent' })).id
  const db = getTestPrisma()
  const conversation = await db.conversation.create({ data: { listingId, renterId: renter.id, ownerId: owner.id } })
  conversationId = conversation.id
  messageId = (await db.message.create({ data: { conversationId, senderId: renter.id, body: 'Is it still free?' } })).id
})

after(async () => disconnectTestPrisma())

const as = (token: string) => ({
  get: (path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`),
  post: (path: string, body: object = {}) => supertest(getApp()).post(path).set('Authorization', `Bearer ${token}`).send(body),
})

async function suspend(userId: string) {
  const res = await as(admin.token).post(`/admin/users/${userId}/suspend`)
  assert.equal(res.status, 200, JSON.stringify(res.body))
}

describe('admin suspend / unsuspend', () => {
  test('only admins can suspend; it sets and clears suspendedAt', async () => {
    assert.equal((await as(renter.token).post(`/admin/users/${owner.id}/suspend`)).status, 403)
    await suspend(owner.id)
    assert.ok((await getTestPrisma().user.findUniqueOrThrow({ where: { id: owner.id } })).suspendedAt)
    const un = await as(admin.token).post(`/admin/users/${owner.id}/unsuspend`)
    assert.equal(un.status, 200)
    assert.equal((await getTestPrisma().user.findUniqueOrThrow({ where: { id: owner.id } })).suspendedAt, null)
  })

  test('an admin account cannot be suspended', async () => {
    const other = await createTestUser({ firstName: 'Admin2', role: Role.ADMIN })
    assert.equal((await as(admin.token).post(`/admin/users/${other.id}/suspend`)).status, 400)
  })
})

describe('a suspended user', () => {
  beforeEach(async () => suspend(owner.id))

  test('is refused on every create route with 403', async () => {
    const { startDate, endDate } = futureDates(5, 2)
    const otherListing = (await createTestListing(renter.id)).id
    const attempts = () => [
      () => as(owner.token).post('/listings', { title: 'Lamp', description: 'A lamp', category: 'Home', dailyPrice: 5, latitude: 43.66, longitude: -79.39, city: 'Toronto' }),
      () => as(owner.token).post('/bookings', { listingId: otherListing, startDate, endDate }),
      () => as(owner.token).post('/conversations', { listingId: otherListing }),
      () => as(owner.token).post(`/conversations/${conversationId}/messages`, { body: 'hello' }),
      () => as(owner.token).post('/reports', { targetType: 'MESSAGE', targetId: messageId, reason: 'SPAM' }),
      // Refused before the file is read, so no body is sent here.
      () => as(owner.token).post(`/listings/${listingId}/images`),
    ]
    for (const [i, attempt] of attempts().entries()) {
      const res = await attempt()
      assert.equal(res.status, 403, `attempt ${i}: ${JSON.stringify(res.body)}`)
      assert.match(res.body.error, SUSPENDED)
    }
    const booking = await getTestPrisma().booking.create({
      data: { listingId, renterId: renter.id, ownerId: owner.id, startDate: new Date(startDate), endDate: new Date(endDate), totalPrice: new Prisma.Decimal(20), status: BookingStatus.ACTIVE },
    })
    const dispute = await as(owner.token).post('/disputes', { bookingId: booking.id, reason: 'OTHER', description: 'Something went wrong here.' })
    assert.equal(dispute.status, 403)
  })

  test('can still read their own data', async () => {
    assert.equal((await as(owner.token).get('/users/me')).status, 200)
    assert.equal((await as(owner.token).get('/listings/me')).status, 200)
    assert.equal((await as(owner.token).get(`/conversations/${conversationId}/messages`)).status, 200)
  })

  test("has their listings hidden from browse, and they can't be booked or newly messaged about", async () => {
    const browse = await as(renter.token).get('/listings')
    assert.equal(browse.status, 200)
    assert.equal(browse.body.items.some((l: { id: string }) => l.id === listingId), false)
    const cursorBrowse = await as(renter.token).get('/listings?limit=20')
    assert.equal(cursorBrowse.body.items.some((l: { id: string }) => l.id === listingId), false)

    const { startDate, endDate } = futureDates(5, 2)
    const book = await as(renter.token).post('/bookings', { listingId, startDate, endDate })
    assert.equal(book.status, 400)
    assert.equal(book.body.error, 'This listing is currently unavailable.')

    const stranger = await createTestUser({ firstName: 'Stranger' })
    assert.equal((await as(stranger.token).post('/conversations', { listingId })).status, 400)
    assert.equal((await as(renter.token).post('/conversations', { listingId })).status, 201, 'the existing chat still opens')
  })

  test('can finish an existing rental: start the return and tap', async () => {
    const { startDate, endDate } = futureDates(0, 2)
    const booking = await getTestPrisma().booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(20),
        status: BookingStatus.ACTIVE,
        paymentStatus: PaymentStatus.CAPTURED,
      },
    })
    // The renter starts the return; the suspended owner confirms it.
    const photos = [handoffPhotoUrl(booking.id, 'a'), handoffPhotoUrl(booking.id, 'b')]
    assert.equal((await as(renter.token).post(`/bookings/${booking.id}/return/initiate`, { photos })).status, 200)
    const tap = await as(owner.token).post(`/bookings/${booking.id}/return/confirm`)
    assert.equal(tap.status, 200, JSON.stringify(tap.body))
  })
})
