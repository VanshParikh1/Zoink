import test from 'node:test'
import assert from 'node:assert/strict'
import {
  daysBetween,
  formatDateTime,
  formatDayOf,
  formatRentalDate,
  formatTimeOfDay,
  isCalendarDateValue,
  isTodayInToronto,
  rentalDayCount,
  rentalDayKey,
  torontoDayKey,
} from '../src/dates'

// The device can be anywhere; Ontario students' rentals must read the same.
const ZONES = ['America/Toronto', 'America/Vancouver', 'UTC', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']

function inEachZone(fn: () => void) {
  const original = process.env.TZ
  try {
    for (const zone of ZONES) {
      process.env.TZ = zone
      fn()
    }
  } finally {
    process.env.TZ = original
  }
}

test('a calendar date (midnight UTC) is the day the renter picked, in every device time zone', () => {
  inEachZone(() => {
    assert.equal(rentalDayKey('2026-10-20T00:00:00.000Z'), '2026-10-20')
    assert.equal(formatRentalDate('2026-10-20T00:00:00.000Z', 'short', 'en-US'), 'Oct 20')
    assert.equal(formatRentalDate('2026-10-20T00:00:00.000Z', 'weekday', 'en-US'), 'Tue, Oct 20')
    assert.equal(formatRentalDate('2026-10-20T00:00:00.000Z', 'long'), 'October 20 2026')
  })
})

test('a handoff time is shown on its Toronto day, in every device time zone', () => {
  inEachZone(() => {
    // 9:30 PM on Oct 20 in Toronto is already Oct 21 in UTC.
    assert.equal(isCalendarDateValue('2026-10-21T01:30:00.000Z'), false)
    assert.equal(rentalDayKey('2026-10-21T01:30:00.000Z'), '2026-10-20')
    assert.equal(formatRentalDate('2026-10-21T01:30:00.000Z', 'short', 'en-US'), 'Oct 20')
    assert.equal(formatDayOf('2026-10-18T02:00:00.000Z', 'long'), 'October 17 2026')
    assert.equal(formatTimeOfDay('2026-10-21T01:30:00.000Z', 'en-US'), '9:30 PM')
  })
})

test('Toronto days across the spring-forward change (2026-03-08)', () => {
  assert.equal(torontoDayKey('2026-03-08T04:59:59.000Z'), '2026-03-07') // 11:59:59 PM EST
  assert.equal(torontoDayKey('2026-03-08T05:00:00.000Z'), '2026-03-08') // midnight EST
  assert.equal(torontoDayKey('2026-03-08T06:59:59.000Z'), '2026-03-08') // 1:59:59 AM EST
  assert.equal(torontoDayKey('2026-03-08T07:00:00.000Z'), '2026-03-08') // 3:00 AM EDT
  assert.equal(torontoDayKey('2026-03-09T03:59:59.000Z'), '2026-03-08') // 11:59:59 PM EDT
  assert.equal(torontoDayKey('2026-03-09T04:00:00.000Z'), '2026-03-09')
  assert.equal(formatTimeOfDay('2026-03-08T06:59:00.000Z', 'en-US'), '1:59 AM')
  assert.equal(formatTimeOfDay('2026-03-08T07:00:00.000Z', 'en-US'), '3:00 AM')
})

test('Toronto days across the fall-back change (2026-11-01)', () => {
  assert.equal(torontoDayKey('2026-11-01T03:59:59.000Z'), '2026-10-31') // 11:59:59 PM EDT
  assert.equal(torontoDayKey('2026-11-01T04:00:00.000Z'), '2026-11-01') // midnight EDT
  assert.equal(torontoDayKey('2026-11-02T04:59:59.000Z'), '2026-11-01') // 11:59:59 PM EST
  assert.equal(torontoDayKey('2026-11-02T05:00:00.000Z'), '2026-11-02')
  // 1:30 AM happens twice; both are Nov 1.
  assert.equal(formatTimeOfDay('2026-11-01T05:30:00.000Z', 'en-US'), '1:30 AM')
  assert.equal(formatTimeOfDay('2026-11-01T06:30:00.000Z', 'en-US'), '1:30 AM')
})

test('rental day counts are calendar days, unaffected by DST', () => {
  assert.equal(rentalDayCount('2026-03-06T00:00:00.000Z', '2026-03-10T00:00:00.000Z'), 5)
  assert.equal(rentalDayCount('2026-10-30T00:00:00.000Z', '2026-11-02T00:00:00.000Z'), 4)
  assert.equal(rentalDayCount('2026-10-20T00:00:00.000Z', '2026-10-20T00:00:00.000Z'), 1)
  // After pickup the start is the real handoff time (6:30 PM EST, Mar 7).
  assert.equal(rentalDayCount('2026-03-07T23:30:00.000Z', '2026-03-10T00:00:00.000Z'), 4)
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2)
  assert.equal(daysBetween('2026-11-02', '2026-10-31'), -2)
})

test('date-time and today helpers read Toronto time', () => {
  assert.equal(formatDateTime('2026-07-01T22:05:00.000Z', 'en-US'), 'Jul 1, 6:05 PM')
  assert.equal(formatDateTime('2026-12-01T23:05:00.000Z', 'en-US'), 'Dec 1, 6:05 PM')
  const now = '2026-10-21T02:00:00.000Z' // 10 PM, Oct 20 in Toronto
  assert.equal(isTodayInToronto('2026-10-20T16:00:00.000Z', now), true)
  assert.equal(isTodayInToronto('2026-10-21T04:30:00.000Z', now), false)
})

test('missing or invalid values format as empty, never "Invalid Date"', () => {
  assert.equal(formatRentalDate(null), '')
  assert.equal(formatRentalDate('not a date'), '')
  assert.equal(formatTimeOfDay(undefined), '')
  assert.equal(rentalDayKey(''), null)
  assert.equal(rentalDayCount('', '2026-10-20T00:00:00.000Z'), 0)
})
