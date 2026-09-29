/**
 * Integration Tests — handoff evidence photos must come from Zoink's uploads
 * ==========================================================================
 * initiateHandoff stored whatever URLs the client sent (any http(s) URL). The
 * counterparty's app then loaded them — letting one party point handoff
 * "evidence" at an arbitrary server (tracking pixel, swapped image). Only URLs
 * of the shape POST /bookings/:id/photos/upload returns for THIS booking are
 * accepted now.
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
  handoffPhotoUrl,
} from './setup'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import * as handoffService from '../services/handoffService'

const REJECTION = 'Handoff photos must be taken and uploaded in the Zoink app.'

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let bookingId: string
let otherBookingId: string

async function confirmedBooking(listingId: string) {
  const { startDate, endDate } = futureDates(2, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(40),
      status: BookingStatus.CONFIRMED,
      paymentStatus: PaymentStatus.AUTHORIZED,
    },
  })
}

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  const listingId = (await createTestListing(owner.id)).id
  bookingId = (await confirmedBooking(listingId)).id
  otherBookingId = (await confirmedBooking(listingId)).id
})

after(async () => {
  await disconnectTestPrisma()
})

const cloud = () => process.env.CLOUDINARY_CLOUD_NAME

async function rejects(photos: string[]) {
  await assert.rejects(handoffService.initiateHandoff(bookingId, owner.id, 'pickup', photos), {
    statusCode: 400,
    message: REJECTION,
  })
  const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: bookingId } })
  assert.equal(row.status, BookingStatus.CONFIRMED, 'nothing was saved')
  assert.deepEqual(row.pickupPhotos, [])
}

describe('initiateHandoff photo URLs', () => {
  test('accepts the URLs the upload endpoint returns for this booking', async () => {
    const photos = [
      handoffPhotoUrl(bookingId, 'a'),
      // no version segment, other extension
      `https://res.cloudinary.com/${cloud()}/image/upload/bookings/booking_${bookingId}_1790000000000.png`,
    ]
    const updated = await handoffService.initiateHandoff(bookingId, owner.id, 'pickup', photos)
    assert.deepEqual(updated.pickupPhotos, photos)
  })

  test('rejects a URL on another host', async () => {
    await rejects([handoffPhotoUrl(bookingId, 'a'), 'https://evil.example/pixel.jpg'])
  })

  test("rejects another booking's upload", async () => {
    await rejects([handoffPhotoUrl(bookingId, 'a'), handoffPhotoUrl(otherBookingId, 'b')])
  })

  test('rejects another Cloudinary account, a non-image resource and plain http', async () => {
    await rejects([handoffPhotoUrl(bookingId, 'a'), `https://res.cloudinary.com/someone-else/image/upload/v1/bookings/booking_${bookingId}_x.jpg`])
    await rejects([handoffPhotoUrl(bookingId, 'a'), `https://res.cloudinary.com/${cloud()}/raw/upload/v1/bookings/booking_${bookingId}_x.jpg`])
    await rejects([handoffPhotoUrl(bookingId, 'a'), handoffPhotoUrl(bookingId, 'b').replace('https://', 'http://')])
  })

  test('the HTTP route returns 400 for a foreign URL', async () => {
    const res = await supertest(getApp())
      .post(`/bookings/${bookingId}/pickup/initiate`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ photos: [handoffPhotoUrl(bookingId, 'a'), 'https://evil.example/pixel.jpg'] })
    assert.equal(res.status, 400)
    assert.deepEqual(res.body, { error: REJECTION })
  })
})
