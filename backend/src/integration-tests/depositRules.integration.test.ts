/**
 * Integration Tests — pilot deposit rules
 * =======================================
 * Item value at most $1,000; a deposit is none or at least $1, never above the
 * item value; deposit rentals are at most 3 days; and a booking with a deposit
 * can only be paid from 00:00 Toronto time on its start day. Runs with Stripe mocked (no STRIPE_SECRET_KEY).
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import { torontoDayKey } from '@zoink/shared'
import * as bookingService from '../services/bookingService'

let owner: { id: string; token: string }
let renter: { id: string; token: string }

const listing = {
  title: 'Camera',
  description: 'A camera',
  category: 'Electronics',
  dailyPrice: 10,
  latitude: 43.66,
  longitude: -79.39,
  city: 'Toronto',
}

function createListing(body: object) {
  return supertest(getApp()).post('/listings').set('Authorization', `Bearer ${owner.token}`).send({ ...listing, ...body })
}

function issues(res: supertest.Response) {
  return (res.body.issues ?? []).map((i: { message: string }) => i.message)
}

/** Midday UTC on the Toronto calendar day `offset` days from today. */
function torontoDay(offset: number) {
  const [y, m, d] = torontoDayKey()!.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + offset, 12))
}

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
})

after(async () => {
  await truncateAllTables()
  await disconnectTestPrisma()
})

describe('listing deposit and item value', () => {
  test('item value is capped at $1,000', async () => {
    assert.equal((await createListing({ itemValue: 1000, depositAmount: 300 })).status, 201)
    const res = await createListing({ itemValue: 1000.01 })
    assert.equal(res.status, 400)
    assert.ok(issues(res).includes('itemValue cannot exceed 1000.'), JSON.stringify(res.body))
  })

  test('a deposit is none, or at least $1 and no more than the item value', async () => {
    assert.equal((await createListing({ itemValue: 200, depositAmount: 0 })).status, 201)
    assert.equal((await createListing({ itemValue: 200, depositAmount: 1 })).status, 201)
    assert.ok(issues(await createListing({ itemValue: 200, depositAmount: 0.5 })).includes('depositAmount must be at least 1, or 0 for no deposit.'))
    assert.ok(issues(await createListing({ itemValue: 200, depositAmount: 201 })).includes('depositAmount cannot exceed itemValue.'))
  })
})

describe('deposit rentals', () => {
  test('a listing with a deposit can be rented for at most 3 days', async () => {
    const withDeposit = await createTestListing(owner.id, { itemValue: 200, depositAmount: 60 })
    const three = futureDates(3, 3)
    const booked = await bookingService.createBooking(renter.id, { listingId: withDeposit.id, startDate: new Date(three.startDate), endDate: new Date(three.endDate) })
    assert.equal(booked.status, BookingStatus.PENDING)
    const four = futureDates(10, 4)
    await assert.rejects(
      bookingService.createBooking(renter.id, { listingId: withDeposit.id, startDate: new Date(four.startDate), endDate: new Date(four.endDate) }),
      { statusCode: 400, message: 'Rentals with a deposit can be at most 3 days.' },
    )
    // Without a deposit the usual 7-day limit applies.
    const plain = await createTestListing(owner.id)
    const seven = futureDates(3, 7)
    const long = await bookingService.createBooking(renter.id, { listingId: plain.id, startDate: new Date(seven.startDate), endDate: new Date(seven.endDate) })
    assert.equal(long.status, BookingStatus.PENDING)
  })

  async function acceptedBooking(startDay: number, depositAmount: number) {
    const row = await createTestListing(owner.id, { itemValue: 200, depositAmount })
    return getTestPrisma().booking.create({
      data: {
        listingId: row.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: torontoDay(startDay),
        endDate: torontoDay(startDay + 1),
        totalPrice: new Prisma.Decimal(20),
        depositAmount: new Prisma.Decimal(depositAmount),
        status: BookingStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PENDING_AUTH,
      },
    })
  }

  test('a deposit booking can not be paid before its start day, not even the day before', async () => {
    const early = await acceptedBooking(1, 60)
    const res = await supertest(getApp()).post(`/bookings/${early.id}/payment-intent`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(res.status, 409)
    assert.match(res.body.error, /^You can pay from \w{3} \d{1,2}, 12:00\sAM\.$/)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: early.id } })
    assert.equal(row.stripePaymentIntentId, null, 'no PaymentIntent was created')
  })

  test('it can be paid on its start day', async () => {
    const today = await acceptedBooking(0, 60)
    const paid = await supertest(getApp()).post(`/bookings/${today.id}/payment-intent`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(paid.status, 200, JSON.stringify(paid.body))
    assert.ok(paid.body.stripePaymentIntentId)
  })

  test('a booking without a deposit can be paid from 72 h before its start day (P2-4)', async () => {
    // Starting in 3 Toronto days: 72 h before its 00:00 is 00:00 today, so open now.
    const inThree = await acceptedBooking(3, 0)
    const ok = await supertest(getApp()).post(`/bookings/${inThree.id}/payment-intent`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(ok.status, 200, JSON.stringify(ok.body))

    const inFour = await acceptedBooking(4, 0)
    const early = await supertest(getApp()).post(`/bookings/${inFour.id}/payment-intent`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(early.status, 409)
    // The sentence the store app already shows as-is (userMessage passes it through).
    assert.match(early.body.error, /^You can pay from \w{3} \d{1,2}, 12:00\sAM\.$/)
    const confirm = await supertest(getApp()).patch(`/bookings/${inFour.id}/confirm`).set('Authorization', `Bearer ${renter.token}`)
    assert.equal(confirm.status, 409)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: inFour.id } })).stripePaymentIntentId, null)
  })

  test('App Review demo bookings can be paid early, with or without a deposit', async () => {
    const reviewer = await createTestUser({ email: 'reviewer@zoink.app', firstName: 'App' })
    for (const [day, deposit] of [[10, 0], [1, 60]] as const) {
      const b = await acceptedBooking(day, deposit)
      await getTestPrisma().booking.update({ where: { id: b.id }, data: { renterId: reviewer.id } })
      const res = await supertest(getApp()).post(`/bookings/${b.id}/payment-intent`).set('Authorization', `Bearer ${reviewer.token}`)
      assert.equal(res.status, 200, `${day} days ahead, deposit ${deposit}: ${JSON.stringify(res.body)}`)
    }
  })
})
