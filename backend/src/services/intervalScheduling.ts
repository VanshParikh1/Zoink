/**
 * Interval scheduling for booking-conflict detection.
 * ==================================================
 *
 * A listing's blocking bookings (CONFIRMED / ACTIVE) are modelled as a set of
 * closed, INCLUSIVE integer-day intervals: `[start, end]` where both endpoints
 * are epoch-day numbers (days since 1970-01-01 UTC). Day granularity — not raw
 * timestamps — is deliberate: rentals are billed per whole day (see
 * `getRentalDays` in bookingUtils.ts, which likewise truncates each endpoint via
 * `Date.UTC(y, m, d)`), and a booking that ends the same calendar day another
 * begins must count as a conflict because there is no bookable day between them.
 *
 * This module is pure: no Prisma, no I/O, no `Date` mutation. Callers convert
 * their rows to `DayInterval`s with `toDayInterval`, `sortByStart` them once,
 * then run `hasConflict` (O(log n)) per candidate.
 *
 * PRECONDITION for `hasConflict`: the sorted set is pairwise non-overlapping.
 * CONFIRMED/ACTIVE bookings for one listing always satisfy this — that is
 * exactly the invariant the conflict check exists to preserve. If you need to
 * test against a set that may contain mutually overlapping intervals, run it
 * through `mergeIntervals` first.
 */

const MS_PER_DAY = 86_400_000

export interface DayInterval {
  /** Inclusive start, as an epoch-day integer. */
  start: number
  /** Inclusive end, as an epoch-day integer. */
  end: number
  /** Optional identifier carried through for debugging / diagnostics. */
  id?: string
}

/**
 * Truncate a `Date` to its UTC calendar day and return that day as an integer
 * (days since the Unix epoch). Matches the normalisation `getRentalDays` uses,
 * so interval math here lines up exactly with per-day rental billing.
 */
export function toEpochDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY
}

/** Build an inclusive day interval from a start/end `Date` pair. */
export function toDayInterval(startDate: Date, endDate: Date, id?: string): DayInterval {
  return { start: toEpochDay(startDate), end: toEpochDay(endDate), id }
}

/**
 * Return a new array sorted by `start` ascending, then `end` ascending. Does not
 * mutate the input. O(n log n).
 */
export function sortByStart(intervals: readonly DayInterval[]): DayInterval[] {
  return [...intervals].sort((a, b) => a.start - b.start || a.end - b.end)
}

/**
 * Index of the first interval whose `start` is >= `target` (lower bound on the
 * `start` key). Returns `sorted.length` if every interval starts before
 * `target`. O(log n).
 */
function firstIndexWithStartAtLeast(sorted: readonly DayInterval[], target: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid].start < target) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

/**
 * Does `candidate` overlap any interval in `sorted` (inclusive on both ends)?
 *
 * `sorted` must be sorted by `start` (use `sortByStart`) and pairwise
 * non-overlapping (see module note). With those held, only two intervals can
 * possibly touch the candidate — the last one starting before it and the first
 * one starting at/after it — so a single binary search plus two comparisons
 * settles it in O(log n).
 *
 * Two inclusive intervals [a,b] and [c,d] overlap iff `a <= d && c <= b`.
 */
export function hasConflict(sorted: readonly DayInterval[], candidate: DayInterval): boolean {
  if (sorted.length === 0) {
    return false
  }

  const i = firstIndexWithStartAtLeast(sorted, candidate.start)

  // Predecessor: the last interval starting strictly before the candidate.
  // It overlaps iff it also ends on/after the candidate's start.
  if (i > 0 && sorted[i - 1].end >= candidate.start) {
    return true
  }

  // Successor: sorted[i] has the smallest start among intervals starting at/after
  // the candidate's start. If that start is still <= the candidate's end, it
  // begins inside the candidate — an overlap. If not, nothing at index >= i can
  // overlap either (they start even later).
  if (i < sorted.length && sorted[i].start <= candidate.end) {
    return true
  }

  return false
}

/**
 * Coalesce a start-sorted set into the minimal set of disjoint inclusive
 * intervals covering the same days. Adjacent intervals are merged too:
 * `[1,3]` and `[4,6]` become `[1,6]` because no bookable day separates them.
 * The result is sorted by `start` and has no `id`s (they no longer map 1:1).
 *
 * This is the building block for "next available window" style queries — the
 * gaps between the merged intervals are exactly the free spans.
 * O(n) given sorted input.
 */
export function mergeIntervals(sorted: readonly DayInterval[]): DayInterval[] {
  if (sorted.length === 0) {
    return []
  }

  const merged: DayInterval[] = [{ start: sorted[0].start, end: sorted[0].end }]

  for (let k = 1; k < sorted.length; k++) {
    const cur = sorted[k]
    const last = merged[merged.length - 1]
    if (cur.start <= last.end + 1) {
      if (cur.end > last.end) {
        last.end = cur.end
      }
    } else {
      merged.push({ start: cur.start, end: cur.end })
    }
  }

  return merged
}
