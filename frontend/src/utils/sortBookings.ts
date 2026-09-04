import { Booking } from '../types'

// Statuses for a live, in-progress rental. These always sort ahead of
// everything else so the user sees them first no matter their dates — a
// finished or not-yet-started booking is never more urgent than one that's
// currently underway.
const LIVE_STATUSES: ReadonlyArray<Booking['status']> = [
  'CONFIRMED',
  'PICKUP_PENDING',
  'ACTIVE',
  'RETURN_PENDING',
]

export function isLiveBooking(status: Booking['status']): boolean {
  return LIVE_STATUSES.includes(status)
}

// Returns a new array (does not mutate the input): live bookings first, ordered
// by the rental starting soonest; then everything else, most recent rental
// first.
export function sortBookingsLiveFirst(bookings: Booking[]): Booking[] {
  return [...bookings].sort((left, right) => {
    const leftLive = isLiveBooking(left.status)
    const rightLive = isLiveBooking(right.status)
    if (leftLive !== rightLive) return leftLive ? -1 : 1

    const leftStart = new Date(left.startDate).getTime()
    const rightStart = new Date(right.startDate).getTime()
    return leftLive ? leftStart - rightStart : rightStart - leftStart
  })
}
