import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DayInterval,
  hasConflict,
  mergeIntervals,
  sortByStart,
  toDayInterval,
  toEpochDay,
} from './intervalScheduling'

// Small helper: build an interval straight from day numbers so the tests read in
// "day 3 to day 7" terms rather than epoch arithmetic. `id` is only attached
// when supplied, so the shape matches mergeIntervals' id-less output for
// deep-equality checks.
const iv = (start: number, end: number, id?: string): DayInterval =>
  id === undefined ? { start, end } : { start, end, id }

// Run the real caller pipeline: sort an unsorted set, then query.
const conflicts = (existing: DayInterval[], candidate: DayInterval) =>
  hasConflict(sortByStart(existing), candidate)

// ─────────────────────────────────────────────────────────────────────────────
// toEpochDay / toDayInterval — day normalisation
// ─────────────────────────────────────────────────────────────────────────────

test('toEpochDay truncates to the UTC calendar day regardless of time of day', () => {
  const midnight = new Date('2026-05-10T00:00:00.000Z')
  const noon = new Date('2026-05-10T12:00:00.000Z')
  const almostMidnight = new Date('2026-05-10T23:59:59.999Z')

  assert.equal(toEpochDay(midnight), toEpochDay(noon))
  assert.equal(toEpochDay(noon), toEpochDay(almostMidnight))
  assert.equal(toEpochDay(new Date('2026-05-11T00:00:00.000Z')), toEpochDay(noon) + 1)
})

test('toEpochDay matches the Date.UTC(y,m,d)/86_400_000 definition', () => {
  const d = new Date('2026-05-10T08:30:00.000Z')
  assert.equal(toEpochDay(d), Date.UTC(2026, 4, 10) / 86_400_000)
})

test('toDayInterval carries the id and both inclusive endpoints', () => {
  const interval = toDayInterval(
    new Date('2026-05-10T12:00:00.000Z'),
    new Date('2026-05-12T12:00:00.000Z'),
    'booking-1'
  )
  assert.deepEqual(interval, {
    start: Date.UTC(2026, 4, 10) / 86_400_000,
    end: Date.UTC(2026, 4, 12) / 86_400_000,
    id: 'booking-1',
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// sortByStart
// ─────────────────────────────────────────────────────────────────────────────

test('sortByStart orders by start, then end, without mutating the input', () => {
  const input = [iv(10, 12), iv(3, 30), iv(3, 4), iv(20, 21)]
  const sorted = sortByStart(input)

  assert.deepEqual(
    sorted.map((i) => [i.start, i.end]),
    [[3, 4], [3, 30], [10, 12], [20, 21]]
  )
  // input untouched
  assert.deepEqual(input.map((i) => i.start), [10, 3, 3, 20])
})

test('sortByStart on empty and single-element inputs', () => {
  assert.deepEqual(sortByStart([]), [])
  assert.deepEqual(sortByStart([iv(5, 9)]), [iv(5, 9)])
})

// ─────────────────────────────────────────────────────────────────────────────
// hasConflict — empty / single
// ─────────────────────────────────────────────────────────────────────────────

test('hasConflict: empty set never conflicts', () => {
  assert.equal(hasConflict([], iv(1, 5)), false)
})

test('hasConflict: single interval — overlap vs clear', () => {
  const existing = [iv(10, 20)]
  assert.equal(hasConflict(existing, iv(15, 18)), true) // inside
  assert.equal(hasConflict(existing, iv(5, 10)), true) // touches left endpoint
  assert.equal(hasConflict(existing, iv(20, 25)), true) // touches right endpoint
  assert.equal(hasConflict(existing, iv(1, 9)), false) // fully left, 1-day gap
  assert.equal(hasConflict(existing, iv(21, 30)), false) // fully right, 1-day gap
})

// ─────────────────────────────────────────────────────────────────────────────
// hasConflict — back-to-back / same-day (inclusive-end semantics)
// ─────────────────────────────────────────────────────────────────────────────

test('hasConflict: back-to-back bookings sharing a boundary day DO conflict', () => {
  // existing ends on day 15; candidate starts on day 15 — no free day between.
  assert.equal(conflicts([iv(10, 15)], iv(15, 20)), true)
  // and the mirror image: candidate ends on the day the existing one starts.
  assert.equal(conflicts([iv(15, 20)], iv(10, 15)), true)
})

test('hasConflict: a one-day gap between bookings is NOT a conflict', () => {
  // existing ends day 15, candidate starts day 16 — day-16-exclusive gap is fine
  // (day 15 and day 17 are the touch points; 16 is free).
  assert.equal(conflicts([iv(10, 15)], iv(17, 20)), false)
})

test('hasConflict: full same-day overlap (identical single-day intervals)', () => {
  assert.equal(conflicts([iv(42, 42)], iv(42, 42)), true)
})

test('hasConflict: identical multi-day intervals conflict', () => {
  assert.equal(conflicts([iv(10, 17)], iv(10, 17)), true)
})

// ─────────────────────────────────────────────────────────────────────────────
// hasConflict — containment (both directions)
// ─────────────────────────────────────────────────────────────────────────────

test('hasConflict: candidate fully contained inside an existing interval', () => {
  assert.equal(conflicts([iv(1, 100)], iv(40, 45)), true)
})

test('hasConflict: candidate fully contains an existing interval', () => {
  assert.equal(conflicts([iv(40, 45)], iv(1, 100)), true)
})

// ─────────────────────────────────────────────────────────────────────────────
// hasConflict — candidate entirely before / after all existing intervals
// ─────────────────────────────────────────────────────────────────────────────

test('hasConflict: candidate entirely before every existing interval', () => {
  assert.equal(conflicts([iv(10, 12), iv(20, 25), iv(30, 40)], iv(1, 5)), false)
})

test('hasConflict: candidate entirely after every existing interval', () => {
  assert.equal(conflicts([iv(10, 12), iv(20, 25), iv(30, 40)], iv(50, 55)), false)
})

test('hasConflict: candidate lands exactly in a gap between two intervals', () => {
  // existing: [10,12] and [20,25]; candidate [14,18] — free on both sides.
  assert.equal(conflicts([iv(10, 12), iv(20, 25)], iv(14, 18)), false)
  // widen candidate by one day on each side so it now touches both — conflict.
  assert.equal(conflicts([iv(10, 12), iv(20, 25)], iv(12, 20)), true)
})

// ─────────────────────────────────────────────────────────────────────────────
// hasConflict — sort / binary-search boundary conditions
// ─────────────────────────────────────────────────────────────────────────────

test('hasConflict: overlap only with the very first interval', () => {
  const existing = [iv(1, 5), iv(20, 25), iv(40, 45), iv(60, 65)]
  assert.equal(conflicts(existing, iv(3, 4)), true)
})

test('hasConflict: overlap only with the very last interval', () => {
  const existing = [iv(1, 5), iv(20, 25), iv(40, 45), iv(60, 65)]
  assert.equal(conflicts(existing, iv(64, 80)), true)
})

test('hasConflict: overlap with an interior interval only', () => {
  const existing = [iv(1, 5), iv(20, 25), iv(40, 45), iv(60, 65)]
  assert.equal(conflicts(existing, iv(24, 41)), true) // spans the [20,25] & [40,45] pair
  assert.equal(conflicts(existing, iv(26, 39)), false) // sits in the gap between them
})

test('hasConflict: candidate starts exactly where an existing interval starts', () => {
  assert.equal(conflicts([iv(10, 12), iv(30, 40)], iv(30, 30)), true)
})

test('hasConflict: candidate ends exactly where a later interval starts', () => {
  assert.equal(conflicts([iv(10, 12), iv(30, 40)], iv(20, 30)), true)
})

test('hasConflict: many non-overlapping intervals, candidate fits every gap', () => {
  // intervals on days [0,1], [10,11], [20,21], ... candidate [k*10+3, k*10+7]
  const existing = Array.from({ length: 50 }, (_, k) => iv(k * 10, k * 10 + 1))
  for (let k = 0; k < 50; k++) {
    assert.equal(hasConflict(sortByStart(existing), iv(k * 10 + 3, k * 10 + 7)), false)
  }
  // now a candidate that clips the start of interval #37
  assert.equal(hasConflict(sortByStart(existing), iv(367, 371)), true)
})

test('hasConflict: unsorted input is handled once run through sortByStart', () => {
  const existing = [iv(60, 65), iv(1, 5), iv(40, 45), iv(20, 25)]
  assert.equal(conflicts(existing, iv(42, 43)), true)
  assert.equal(conflicts(existing, iv(46, 59)), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// mergeIntervals
// ─────────────────────────────────────────────────────────────────────────────

test('mergeIntervals: empty stays empty', () => {
  assert.deepEqual(mergeIntervals([]), [])
})

test('mergeIntervals: disjoint intervals with real gaps are left alone', () => {
  const merged = mergeIntervals(sortByStart([iv(1, 3), iv(10, 12), iv(20, 25)]))
  assert.deepEqual(merged, [iv(1, 3), iv(10, 12), iv(20, 25)])
})

test('mergeIntervals: overlapping intervals collapse', () => {
  const merged = mergeIntervals(sortByStart([iv(1, 10), iv(5, 8), iv(9, 15)]))
  assert.deepEqual(merged, [iv(1, 15)])
})

test('mergeIntervals: adjacent inclusive-day intervals (no free day) collapse', () => {
  // [1,3] and [4,6] have no bookable day between them.
  const merged = mergeIntervals(sortByStart([iv(1, 3), iv(4, 6)]))
  assert.deepEqual(merged, [iv(1, 6)])
})

test('mergeIntervals: a one-day gap is preserved (that day is bookable)', () => {
  const merged = mergeIntervals(sortByStart([iv(1, 3), iv(5, 6)]))
  assert.deepEqual(merged, [iv(1, 3), iv(5, 6)])
})

test('mergeIntervals: nested interval does not extend the envelope', () => {
  const merged = mergeIntervals(sortByStart([iv(1, 100), iv(20, 30)]))
  assert.deepEqual(merged, [iv(1, 100)])
})

test('mergeIntervals: gaps between merged blocks are the free windows', () => {
  const merged = mergeIntervals(sortByStart([iv(3, 5), iv(6, 8), iv(15, 20)]))
  assert.deepEqual(merged, [iv(3, 8), iv(15, 20)])
  // the free window between the two blocks is days 9..14 inclusive
  const freeStart = merged[0].end + 1
  const freeEnd = merged[1].start - 1
  assert.deepEqual([freeStart, freeEnd], [9, 14])
})

test('mergeIntervals: does not mutate the input intervals', () => {
  const input = sortByStart([iv(1, 3), iv(4, 6)])
  const snapshot = input.map((i) => ({ ...i }))
  mergeIntervals(input)
  assert.deepEqual(input, snapshot)
})
