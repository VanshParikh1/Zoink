/**
 * Integration Tests — what a booking request's dates mean
 * ======================================================
 * The app sends calendar days at 00:00 UTC with an inclusive end, and a
 * one-day rental as start === end (BookingRequestScreen). The API accepts
 * exactly that and nothing else.
 */
import { truncateAllTables, createTestUser, createTestListing, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { torontoDayKey } from '@zoink/shared'

let renter: { token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  const owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id, { dailyPrice: 12 })).id
})

after(async () => disconnectTestPrisma())

function day(offset: number, time = '00:00:00.000') {
  const d = new Date(`${torontoDayKey()}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return `${d.toISOString().slice(0, 10)}T${time}Z`
}

const request = (startDate: string, endDate: string) =>
  supertest(getApp()).post('/bookings').set('Authorization', `Bearer ${renter.token}`).send({ listingId, startDate, endDate })

describe('POST /bookings dates', () => {
  test('a one-day rental is start === end, billed as one day', async () => {
    const res = await request(day(2), day(2))
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.totalPrice, 12)
  })

  test('the end day is inclusive: three days is start + 2', async () => {
    const res = await request(day(2), day(4))
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.totalPrice, 36)
  })

  test('a time other than 00:00 UTC is refused', async () => {
    for (const [start, end] of [
      [day(2, '12:00:00.000'), day(3)],
      [day(2), day(3, '04:00:00.000')],
    ]) {
      const res = await request(start, end)
      assert.equal(res.status, 400, `${start} ${end}`)
      assert.match(res.body.issues[0].message, /calendar day at 00:00 UTC/)
    }
    assert.equal(await getTestPrisma().booking.count(), 0)
  })

  test('an end before the start is refused', async () => {
    const res = await request(day(3), day(2))
    assert.equal(res.status, 400)
    assert.equal(res.body.issues[0].message, 'endDate cannot be before startDate.')
  })
})
