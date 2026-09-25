/**
 * Integration Tests — a listing's exact location stays with its owner
 * ===================================================================
 * GET /listings and GET /listings/:id returned every listing's exact
 * latitude/longitude and street address to any verified user; the app's
 * "General area" map only blurred it visually. And an exact distanceKm plus
 * the radius filter would let anyone trilaterate the point anyway.
 *
 * Now: non-owners get a stable public point 200-500 m from the real one and no
 * address; distance and the radius filter use that public point and distance
 * is rounded to 0.5 km. The owner still gets the exact point and address. A
 * booking shows the address to the owner, and to the renter only once the
 * booking is CONFIRMED (paid).
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
import { BookingStatus, Prisma } from '@prisma/client'

// createTestListing places listings here, with this address.
const EXACT = { latitude: 43.6629, longitude: -79.3957 }
const ADDRESS = "27 King's College Circle, Toronto"

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

after(async () => {
  await disconnectTestPrisma()
})

function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const get = (path: string, token: string) => supertest(getApp()).get(path).set('Authorization', `Bearer ${token}`)

describe('listing location for non-owners', () => {
  test('GET /listings/:id returns a stable point 200-500 m away and no address', async () => {
    const first = await get(`/listings/${listingId}`, renter.token)
    assert.equal(first.status, 200)
    const offset = metersBetween(EXACT, first.body)
    assert.ok(offset >= 199 && offset <= 501, `public point is ${offset.toFixed(0)} m from the exact one`)
    assert.equal(first.body.address, null)
    assert.equal(first.body.publicLatitude, undefined, 'no extra location fields leak')

    const second = await get(`/listings/${listingId}`, renter.token)
    assert.equal(second.body.latitude, first.body.latitude, 'not re-rolled per request')
    assert.equal(second.body.longitude, first.body.longitude)
  })

  test('browse returns the public point, no address, and a distance rounded to 0.5 km', async () => {
    const res = await get(`/listings?latitude=43.70&longitude=-79.40&radiusKm=50`, renter.token)
    const item = res.body.items.find((l: any) => l.id === listingId)
    assert.ok(item)
    assert.ok(metersBetween(EXACT, item) >= 199)
    assert.equal(item.address, null)
    assert.equal(item.distanceKm * 2, Math.round(item.distanceKm * 2), `${item.distanceKm} is a multiple of 0.5`)
  })

  test("the radius filter can't be used to pinpoint the exact location", async () => {
    // Standing on the exact point with a 150 m radius: the public point is at
    // least 200 m away, so the listing is not "within" it.
    const tight = await get(`/listings?latitude=${EXACT.latitude}&longitude=${EXACT.longitude}&radiusKm=0.15`, renter.token)
    assert.equal(tight.body.items.some((l: any) => l.id === listingId), false)

    const wide = await get(`/listings?latitude=${EXACT.latitude}&longitude=${EXACT.longitude}&radiusKm=1`, renter.token)
    assert.equal(wide.body.items.some((l: any) => l.id === listingId), true)
  })
})

describe('listing location for the owner', () => {
  test('detail, my-listings and browse return the exact point and address', async () => {
    const detail = await get(`/listings/${listingId}`, owner.token)
    assert.equal(detail.body.latitude, EXACT.latitude)
    assert.equal(detail.body.longitude, EXACT.longitude)
    assert.equal(detail.body.address, ADDRESS)

    const mine = await get('/listings/me', owner.token)
    assert.equal(mine.body[0].latitude, EXACT.latitude)
    assert.equal(mine.body[0].address, ADDRESS)
  })

  test('moving the listing re-rolls the public point around the new location', async () => {
    const moved = { latitude: 43.7735, longitude: -79.5019 }
    const res = await supertest(getApp())
      .patch(`/listings/${listingId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(moved)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.latitude, moved.latitude, 'owner sees the new exact point')

    const publicView = await get(`/listings/${listingId}`, renter.token)
    const offset = metersBetween(moved, publicView.body)
    assert.ok(offset >= 199 && offset <= 501, `new public point is ${offset.toFixed(0)} m from the new exact one`)
  })
})

describe('address in booking responses', () => {
  async function bookingIn(status: BookingStatus) {
    const { startDate, endDate } = futureDates(3, 2)
    return getTestPrisma().booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(20),
        status,
      },
    })
  }

  test('the renter only sees the address once the booking is paid', async () => {
    for (const status of [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.DECLINED, BookingStatus.CANCELLED]) {
      const booking = await bookingIn(status)
      const res = await get(`/bookings/${booking.id}`, renter.token)
      assert.equal(res.body.listing.address, null, `hidden while ${status}`)
    }
    for (const status of [BookingStatus.CONFIRMED, BookingStatus.PICKUP_PENDING, BookingStatus.ACTIVE, BookingStatus.RETURN_PENDING, BookingStatus.COMPLETED]) {
      const booking = await bookingIn(status)
      const res = await get(`/bookings/${booking.id}`, renter.token)
      assert.equal(res.body.listing.address, ADDRESS, `shown once ${status}`)
    }
  })

  test('the owner always sees the address, and lists follow the same rule', async () => {
    const pending = await bookingIn(BookingStatus.PENDING)
    assert.equal((await get(`/bookings/${pending.id}`, owner.token)).body.listing.address, ADDRESS)
    const requests = await get('/bookings/requests', owner.token)
    assert.equal(requests.body[0].listing.address, ADDRESS)
    const mine = await get('/bookings/me', renter.token)
    assert.equal(mine.body[0].listing.address, null)
  })

  test('booking responses carry no coordinates at all', async () => {
    const booking = await bookingIn(BookingStatus.CONFIRMED)
    const res = await get(`/bookings/${booking.id}`, renter.token)
    assert.equal(res.body.listing.latitude, undefined)
    assert.equal(res.body.listing.longitude, undefined)
  })
})
