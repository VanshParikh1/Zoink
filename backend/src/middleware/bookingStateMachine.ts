import { BookingStatus } from '@prisma/client'
import { ConflictError } from '../utils/errors'

// Every move goes through its handoff step: CONFIRMED reaches ACTIVE only via
// PICKUP_PENDING (photos, both taps, rent captured), and ACTIVE reaches
// COMPLETED only via RETURN_PENDING.
const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'CANCELLED'],
  ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PICKUP_PENDING', 'CANCELLED'],
  DECLINED: [],
  PICKUP_PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['RETURN_PENDING'],
  RETURN_PENDING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

/** A move the state machine doesn't allow. A 409 for the client (it acted on
 *  a stale status); this used to be a plain Error, which the error handler
 *  answered with a 500 and reported to Sentry as a crash. */
export class InvalidBookingTransitionError extends ConflictError {
  readonly code = 'BOOKING_INVALID_TRANSITION'
  constructor() {
    super('That booking transition is not allowed.')
  }
}

export function assertBookingTransition(currentStatus: BookingStatus, nextStatus: BookingStatus) {
  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new InvalidBookingTransitionError()
  }
}
