import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureValidBookingDates,
  getRentalDays,
  roundCurrency,
} from './bookingUtils'

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
