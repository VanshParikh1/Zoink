/**
 * Integration Tests — paginated lists
 * ====================================
 * Every list that grows with use is paginated by cursor, opt-in: a request
 * with `limit` (or a `cursor`) gets `{ items, nextCursor, … }` with only the
 * fields the list screen renders; one without gets the original response,
 * capped at LEGACY_LIST_CAP, for app builds released before pagination.
 *
 * For each list: walking every page returns each row exactly once, in the
 * order the screen shows; pages carry no field the screen doesn't use; a bad
 * cursor or limit is a 400; and the legacy response is unchanged but capped.
 */

import test, { after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, Prisma } from '@prisma/client'
import {
  createTestListing,
  createTestUser,
  disconnectTestPrisma,
  getApp,
  getTestPrisma,
  truncateAllTables,
} from './setup'
import { LEGACY_LIST_CAP } from '../utils/pagination'

type U = { id: string; token: string }
let owner: U
let renter: U
let stranger: U

const get = (token: string, path: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`)

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  stranger = await createTestUser({ firstName: 'Stranger' })
})

after(async () => {
  await disconnectTestPrisma()
})

/** Every page of a list, following nextCursor. */
async function walk<T>(token: string, path: string, limit: number): Promise<{ pages: any[]; items: T[] }> {
  const pages: any[] = []
  let cursor: string | null = null
  do {
    const sep = path.includes('?') ? '&' : '?'
    const res = await get(token, `${path}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.ok(Array.isArray(res.body.items), 'a page has items')
    assert.ok(res.body.items.length <= limit)
    pages.push(res.body)
    cursor = res.body.nextCursor
    assert.ok(pages.length < 100, 'pagination terminates')
  } while (cursor)
  return { pages, items: pages.flatMap((page) => page.items) }
}

function day(offset: number) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() + offset)
  return date
}

async function booking(listingId: string, status: BookingStatus, startOffset: number, renterId = renter.id) {
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId,
      ownerId: owner.id,
      startDate: day(startOffset),
      endDate: day(startOffset + 1),
      totalPrice: new Prisma.Decimal(20),
      depositAmount: new Prisma.Decimal(0),
      commissionAmount: new Prisma.Decimal(3),
      ownerPayout: new Prisma.Decimal(17),
      insuranceFee: new Prisma.Decimal(0),
      hstAmount: new Prisma.Decimal(2.6),
      status,
      stripePaymentIntentId: 'pi_secret_for_the_renter',
    },
  })
}

const LIVE: BookingStatus[] = ['CONFIRMED', 'PICKUP_PENDING', 'ACTIVE', 'RETURN_PENDING']

/** The screens' order (frontend utils/sortBookings.ts). */
function screenOrder(rows: { id: string; status: BookingStatus; startDate: Date }[]) {
  return [...rows]
    .sort((a, b) => {
      const aLive = LIVE.includes(a.status)
      const bLive = LIVE.includes(b.status)
      if (aLive !== bLive) return aLive ? -1 : 1
      const diff = aLive ? a.startDate.getTime() - b.startDate.getTime() : b.startDate.getTime() - a.startDate.getTime()
      return diff !== 0 ? diff : a.id < b.id ? -1 : 1
    })
    .map((row) => row.id)
}

describe('booking lists (GET /bookings/requests, GET /bookings/me)', () => {
  async function seedBookings() {
    const listing = (await createTestListing(owner.id, { title: 'Paged Drill' })).id
    await getTestPrisma().listingImage.createMany({
      data: [
        { listingId: listing, url: 'https://example.com/second.jpg', order: 1 },
        { listingId: listing, url: 'https://example.com/first.jpg', order: 0 },
      ],
    })
    const statuses: BookingStatus[] = ['PENDING', 'ACCEPTED', 'CONFIRMED', 'PICKUP_PENDING', 'DECLINED', 'ACTIVE', 'RETURN_PENDING', 'COMPLETED', 'CANCELLED']
    const rows = []
    for (let i = 0; i < 23; i++) {
      // Some share a start day, so the id tiebreak is exercised.
      rows.push(await booking(listing, statuses[i % statuses.length], (i * 7) % 11))
    }
    const otherRenter = await createTestUser()
    rows.push(await booking(listing, 'PENDING', 3, otherRenter.id))
    return rows
  }

  test("the owner's requests: every booking once, live first, in the screen's order, with counts", async () => {
    const rows = await seedBookings()

    const { pages, items } = await walk<any>(owner.token, '/bookings/requests', 5)

    assert.equal(pages.length, 5)
    assert.deepEqual(items.map((item) => item.id), screenOrder(rows))
    for (const page of pages) {
      assert.equal(page.total, rows.length)
      assert.equal(page.pendingCount, rows.filter((row) => row.status === 'PENDING').length)
    }
    assert.equal(pages[pages.length - 1].nextCursor, null)
  })

  test("the renter's rentals: only theirs, in the screen's order", async () => {
    const rows = await seedBookings()
    const mine = rows.filter((row) => row.renterId === renter.id)

    const { items, pages } = await walk<any>(renter.token, '/bookings/me', 7)

    assert.deepEqual(items.map((item) => item.id), screenOrder(mine))
    assert.equal(pages[0].total, mine.length)
    assert.deepEqual((await walk<any>(stranger.token, '/bookings/me', 7)).items, [])
  })

  test('a page row carries only what the list screens render', async () => {
    await seedBookings()
    const res = await get(owner.token, '/bookings/requests?limit=1')
    const [item] = res.body.items
    assert.deepEqual(Object.keys(item).sort(), [
      'endDate', 'id', 'listing', 'listingId', 'owner', 'ownerId', 'ownerPayout', 'renter', 'renterId', 'startDate', 'status', 'totalPrice',
    ])
    assert.deepEqual(Object.keys(item.listing).sort(), ['category', 'dailyPrice', 'id', 'images', 'title'])
    assert.equal(item.listing.title, 'Paged Drill')
    assert.deepEqual(item.listing.images.map((image: { url: string }) => image.url), ['https://example.com/first.jpg'])
    assert.deepEqual(Object.keys(item.renter).sort(), ['firstName', 'id', 'lastName'])
    assert.equal(typeof item.totalPrice, 'number')
    assert.ok(!JSON.stringify(res.body).includes('pi_secret_for_the_renter'))
  })

  test('a cursor this server did not hand out, or a limit over 50, is a 400', async () => {
    for (const bad of ['?cursor=nonsense', '?limit=51', '?limit=0', `?cursor=${Buffer.from('[0,"x",1]').toString('base64url')}`]) {
      const res = await get(owner.token, `/bookings/requests${bad}`)
      assert.equal(res.status, 400, `${bad}: ${JSON.stringify(res.body)}`)
    }
  })

  test(`without limit, the original full rows come back, capped at ${LEGACY_LIST_CAP}`, async () => {
    const listing = (await createTestListing(owner.id)).id
    const extra = LEGACY_LIST_CAP + 5
    await getTestPrisma().booking.createMany({
      data: Array.from({ length: extra }, (_, i) => ({
        listingId: listing,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: day(i % 30),
        endDate: day((i % 30) + 1),
        totalPrice: new Prisma.Decimal(20),
        status: 'COMPLETED' as BookingStatus,
      })),
    })

    for (const path of ['/bookings/requests', '/bookings/me']) {
      const res = await get(path === '/bookings/me' ? renter.token : owner.token, path)
      assert.equal(res.status, 200)
      assert.ok(Array.isArray(res.body), 'still a bare array')
      assert.equal(res.body.length, LEGACY_LIST_CAP)
      assert.ok('reviewObligations' in res.body[0] && 'paymentStatus' in res.body[0], 'still the full booking shape')
    }
  })
})

describe("the owner's listings (GET /listings/me)", () => {
  test('every listing once, most recent booking activity first, with the booking it is rented out on', async () => {
    const ids: string[] = []
    for (let i = 0; i < 7; i++) ids.push((await createTestListing(owner.id, { title: `Mine ${i}` })).id)
    // Activity: a booking's updatedAt; a listing without bookings counts from its creation.
    const rented = await booking(ids[2], 'ACTIVE', 0)
    await getTestPrisma().booking.update({ where: { id: rented.id }, data: { updatedAt: new Date(Date.now() + 60_000) } })
    const older = await booking(ids[5], 'COMPLETED', -10)
    await getTestPrisma().booking.update({ where: { id: older.id }, data: { updatedAt: new Date(Date.now() + 30_000) } })
    const deleted = (await createTestListing(owner.id, { title: 'Gone' })).id
    await getTestPrisma().listing.update({ where: { id: deleted }, data: { deletedAt: new Date() } })
    await createTestListing(stranger.id, { title: 'Not mine' })

    const { items } = await walk<any>(owner.token, '/listings/me', 3)

    const created = await getTestPrisma().listing.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } })
    const byCreation = [...created].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
    const expected = [ids[2], ids[5], ...byCreation.map((row) => row.id).filter((id) => id !== ids[2] && id !== ids[5])]
    assert.deepEqual(items.map((item) => item.id), expected)
    assert.equal(items.find((item) => item.id === ids[2]).activeBookingId, rented.id)
    assert.equal(items.find((item) => item.id === ids[5]).activeBookingId, null)
    assert.deepEqual(Object.keys(items[0]).sort(), ['activeBookingId', 'category', 'dailyPrice', 'depositAmount', 'id', 'images', 'isAvailable', 'title'])
  })

  test(`without limit, the original list, capped at ${LEGACY_LIST_CAP}`, async () => {
    await getTestPrisma().listing.createMany({
      data: Array.from({ length: LEGACY_LIST_CAP + 3 }, (_, i) => ({
        title: `Bulk ${i}`,
        description: 'Bulk',
        category: 'Tools',
        dailyPrice: new Prisma.Decimal(5),
        latitude: 43.66,
        longitude: -79.39,
        city: 'Toronto',
        ownerId: owner.id,
      })),
    })
    const res = await get(owner.token, '/listings/me')
    assert.ok(Array.isArray(res.body))
    assert.equal(res.body.length, LEGACY_LIST_CAP)
    assert.ok('description' in res.body[0] && 'owner' in res.body[0], 'still the full listing shape')
  })
})

describe('browse and search (GET /listings)', () => {
  const near = 'latitude=43.6629&longitude=-79.3957&radiusKm=5000'

  async function seedListings() {
    const ids: string[] = []
    for (let i = 0; i < 11; i++) {
      const { id } = await createTestListing(owner.id, { title: i % 2 ? `Odd camera ${i}` : `Even tent ${i}` })
      // Spread the pickup points ~1 km apart so distance order is unambiguous.
      await getTestPrisma().listing.update({ where: { id }, data: { latitude: 43.6629 + i * 0.01, longitude: -79.3957 } })
      ids.push(id)
    }
    // (A listing can't lack a public point: the listings_public_location trigger refills it.)
    const far = (await createTestListing(owner.id, { title: 'Even far away' })).id
    await getTestPrisma().listing.update({ where: { id: far }, data: { latitude: 45.4215, longitude: -75.6972 } })
    const paused = (await createTestListing(owner.id, { title: 'Paused', isAvailable: false })).id
    const gone = (await createTestListing(owner.id, { title: 'Gone' })).id
    await getTestPrisma().listing.update({ where: { id: gone }, data: { deletedAt: new Date(), isAvailable: false } })
    const blocker = await createTestUser()
    const hidden = (await createTestListing(blocker.id, { title: 'Blocked owner' })).id
    await getTestPrisma().userBlock.create({ data: { blockerId: blocker.id, blockedId: renter.id } })
    return { ids, far, excluded: [paused, gone, hidden] }
  }

  test('nearest first, every listing once', async () => {
    const { ids, far, excluded } = await seedListings()

    const { items } = await walk<any>(renter.token, `/listings?${near}`, 4)

    assert.deepEqual(items.map((item) => item.id), [...ids, far])
    const distances = items.map((item) => item.distanceKm)
    assert.deepEqual(distances, [...distances].sort((a, b) => a - b))
    assert.ok(distances[distances.length - 1] > 300, 'Ottawa is last')
    for (const id of excluded) assert.ok(!items.some((item) => item.id === id))
    assert.deepEqual(Object.keys(items[0]).sort(), ['category', 'dailyPrice', 'depositAmount', 'distanceKm', 'id', 'images', 'ownerId', 'title'])
  })

  test('without a location: newest first; a search narrows it', async () => {
    const { ids, far } = await seedListings()
    const all = await walk<any>(renter.token, '/listings', 5)
    const rows = await getTestPrisma().listing.findMany({
      where: { id: { in: [...ids, far] } },
      select: { id: true, createdAt: true },
    })
    const newest = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)).map((row) => row.id)
    assert.deepEqual(all.items.map((item) => item.id), newest)

    const search = await walk<any>(renter.token, `/listings?q=even&${near}`, 2)
    assert.equal(search.items.length, 7)
    assert.ok(search.items.every((item) => item.title.startsWith('Even')))
  })

  test('the offset pages older builds use are unchanged', async () => {
    await seedListings()
    const res = await get(renter.token, `/listings?${near}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.meta.total, 12)
    assert.equal(res.body.items.length, 12)
    assert.ok('description' in res.body.items[0])
    const third = await get(renter.token, `/listings?${near}&limit=5&offset=10`)
    assert.equal(third.body.items.length, 2)
    assert.equal(third.body.meta.hasMore, false)
    assert.equal((await get(renter.token, `/listings?cursor=abc&offset=5`)).status, 400)
  })
})

describe('the inbox (GET /conversations/me)', () => {
  async function seedInbox() {
    const db = getTestPrisma()
    const base = Date.now() - 3_600_000
    const ids: string[] = []
    for (let i = 0; i < 9; i++) {
      const lender = await createTestUser({ firstName: `Lender${i}` })
      const listing = (await createTestListing(lender.id, { title: `Thing ${i}` })).id
      await db.listingImage.create({ data: { listingId: listing, url: `https://example.com/${i}.jpg`, order: 0 } })
      const conversation = await db.conversation.create({
        data: {
          listingId: listing,
          renterId: renter.id,
          ownerId: lender.id,
          // Two share a creation instant, so the id tiebreak is exercised.
          createdAt: new Date(base + Math.min(i, 7) * 1000),
          renterLastReadAt: i % 3 === 0 ? new Date(base + 10_000_000) : null,
        },
      })
      ids.push(conversation.id)
      if (i % 2 === 0) {
        await db.message.create({ data: { conversationId: conversation.id, senderId: lender.id, body: `hello ${i}`, createdAt: new Date(base + 5000 + i) } })
      }
      if (i === 4) {
        await db.message.create({ data: { conversationId: conversation.id, senderId: renter.id, body: 'my reply', createdAt: new Date(base + 9000) } })
      }
      if (i === 6) {
        await db.booking.create({
          data: {
            listingId: listing, renterId: renter.id, ownerId: lender.id, conversationId: conversation.id,
            startDate: day(3), endDate: day(4), totalPrice: new Prisma.Decimal(10), status: 'ACCEPTED',
          },
        })
      }
      if (i === 8) await db.userBlock.create({ data: { blockerId: lender.id, blockedId: renter.id } })
    }
    // A conversation where the renter is the owner side.
    const mine = (await createTestListing(renter.id, { title: 'My own thing' })).id
    await db.conversation.create({ data: { listingId: mine, renterId: stranger.id, ownerId: renter.id, createdAt: new Date(base + 20_000) } })
    return ids
  }

  test('pages hold exactly what the full inbox holds, in the same order, with the unread count', async () => {
    await seedInbox()

    const legacy = await get(renter.token, '/conversations/me')
    const { items, pages } = await walk<any>(renter.token, '/conversations/me', 3)

    assert.equal(legacy.body.length, 9, 'blocked conversation excluded')
    assert.deepEqual(items, legacy.body)
    const unread = legacy.body.filter((conversation: { unread: boolean }) => conversation.unread).length
    assert.ok(unread > 0)
    for (const page of pages) assert.equal(page.unreadCount, unread)
    assert.ok(items.some((item) => item.acceptedUnpaidBookingId), 'accepted-unpaid booking carried')
    assert.deepEqual((await walk<any>(stranger.token, '/conversations/me', 3)).items.length, 1)
  })
})
