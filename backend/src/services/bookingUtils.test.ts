import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureValidBookingDates,
  getRentalDays,
  roundCurrency,
  MAX_RENTAL_DAYS,
} from './bookingUtils'
import { quoteRental, rentalDayCount } from '@zoink/shared'
import { calculateCommission, calculateHst, calculateOwnerPayout } from './paymentService'

test('roundCurrency rounds to cents', () => {
  assert.equal(roundCurrency(10.555), 10.56)
  assert.equal(roundCurrency(10.554), 10.55)
})

test('getRentalDays counts both start and end dates', () => {
  const start = new Date('2026-04-27T00:00:00.000Z')
  const sameDayEnd = new Date('2026-04-27T00:00:00.000Z')
  const nextDayEnd = new Date('2026-04-28T00:00:00.000Z')

  assert.equal(getRentalDays(start, sameDayEnd), 1)
  assert.equal(getRentalDays(start, nextDayEnd), 2)
})

test('ensureValidBookingDates rejects invalid ranges and invalid dates', () => {
  assert.throws(
    () => ensureValidBookingDates(new Date('2026-04-28T00:00:00.000Z'), new Date('2026-04-27T00:00:00.000Z')),
    /Start and end dates are invalid\./
  )
  assert.throws(
    () => ensureValidBookingDates(new Date('invalid'), new Date('2026-04-27T00:00:00.000Z')),
    /Start and end dates are invalid\./
  )
})

test('ensureValidBookingDates rejects a range longer than MAX_RENTAL_DAYS', () => {
  const start = new Date('2026-04-01T00:00:00.000Z')
  const tooLongEnd = new Date('2026-04-08T00:00:00.000Z') // 8-day range (day 1 through day 8)

  assert.equal(getRentalDays(start, tooLongEnd), MAX_RENTAL_DAYS + 1)
  assert.throws(
    () => ensureValidBookingDates(start, tooLongEnd),
    new RegExp(`cannot exceed ${MAX_RENTAL_DAYS} days`)
  )
})

test('ensureValidBookingDates accepts a range of exactly MAX_RENTAL_DAYS', () => {
  const start = new Date('2026-04-01T00:00:00.000Z')
  const exactEnd = new Date('2026-04-07T00:00:00.000Z') // 7-day range

  assert.equal(getRentalDays(start, exactEnd), MAX_RENTAL_DAYS)
  assert.doesNotThrow(() => ensureValidBookingDates(start, exactEnd))
})

test('MAX_RENTAL_DAYS is 7 (contract limit)', () => {
  assert.equal(MAX_RENTAL_DAYS, 7)
})

test('getRentalDays agrees with the app\'s calendar-day count across DST changes', () => {
  // The request screen sends midnight UTC of each picked day; the server and
  // the app (@zoink/shared rentalDayCount) must count the same days.
  const ranges: [string, string][] = [
    ['2026-03-06T00:00:00.000Z', '2026-03-10T00:00:00.000Z'], // spring forward inside
    ['2026-10-29T00:00:00.000Z', '2026-11-04T00:00:00.000Z'], // fall back inside
    ['2026-12-28T00:00:00.000Z', '2027-01-03T00:00:00.000Z'], // year boundary
  ]
  for (const [start, end] of ranges) {
    assert.equal(getRentalDays(new Date(start), new Date(end)), rentalDayCount(start, end))
  }
})

test('the server snapshots exactly the quote the request screen previews', () => {
  // createBooking prices a booking with @zoink/shared quoteRental; this pins
  // that it equals the formulas it used before (daily x days rounded to the
  // cent, tiered commission, 13% HST on rent only).
  for (const dailyPrice of [0.01, 4.99, 15, 19.99, 20, 20.01, 33.33, 50, 50.01, 999.99]) {
    for (let days = 1; days <= MAX_RENTAL_DAYS; days += 1) {
      const q = quoteRental(dailyPrice, days, 25)
      const total = roundCurrency(dailyPrice * days)
      assert.equal(q.totalPrice, total)
      assert.equal(q.commissionAmount, calculateCommission(total, dailyPrice))
      assert.equal(q.ownerPayout, calculateOwnerPayout(total, dailyPrice))
      assert.equal(q.hstAmount, calculateHst(total))
      assert.equal(q.depositAmount, 25)
    }
  }
})
