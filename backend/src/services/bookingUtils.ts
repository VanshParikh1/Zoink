import { DEPOSIT_MAX_RENTAL_DAYS, endOfRentalDay, formatDateTime, paymentOpensAt, roundCurrency } from '@zoink/shared'
import { BadRequestError, ConflictError } from '../utils/errors'

// Card-network authorization holds on the Stripe PaymentIntent are only
// reliably valid for about a week — a rental longer than this risks the
// hold expiring before pickup/return capture. See disputeService.ts /
// paymentService.ts for the payment flows this constrains. Defined in
// @zoink/shared so the app's date picker enforces the same limit.
import { MAX_RENTAL_DAYS } from '@zoink/shared'
export { MAX_RENTAL_DAYS }

export { roundCurrency }

export function getRentalDays(startDate: Date, endDate: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  const normalizedStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  const normalizedEnd = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  const diffDays = Math.round((normalizedEnd - normalizedStart) / msPerDay)
  return diffDays + 1
}

export function ensureValidBookingDates(startDate: Date, endDate: Date) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new BadRequestError('Start and end dates are invalid.')
  }

  if (endDate < startDate) {
    throw new BadRequestError('Start and end dates are invalid.')
  }

  if (getRentalDays(startDate, endDate) > MAX_RENTAL_DAYS) {
    throw new BadRequestError(`Bookings cannot exceed ${MAX_RENTAL_DAYS} days.`)
  }
}

// Pilot deposit rules (see @zoink/shared deposits.ts for why): the deposit is a
// card authorization made when the renter pays, and it has to stay valid until
// the return plus the dispute window.

/** A rental of a listing with a deposit is at most DEPOSIT_MAX_RENTAL_DAYS. */
export function assertDepositRentalLength(depositAmount: number, rentalDays: number) {
  if (depositAmount > 0 && rentalDays > DEPOSIT_MAX_RENTAL_DAYS) {
    throw new BadRequestError(`Rentals with a deposit can be at most ${DEPOSIT_MAX_RENTAL_DAYS} days.`)
  }
}

/** PENDING and ACCEPTED bookings expire at the end of their start day (see
 *  cleanupJob.expireUnconfirmedBookings); after that they can't be accepted,
 *  paid or confirmed. */
export function assertNotExpired(booking: { startDate: Date }, now: number = Date.now()) {
  const closesAt = endOfRentalDay(booking.startDate)
  if (closesAt && now >= closesAt.getTime()) {
    throw new BadRequestError('This booking expired at the end of its start day.')
  }
}

/** A booking can be paid from `paymentOpensAt` (00:00 Toronto on its start day
 *  with a deposit, 72 h before that without one) until its start day ends (it
 *  expires then; see cleanupJob.expireUnconfirmedBookings). Pay and Confirm
 *  call this under the booking lock the expiry job also takes. `reviewerDemo`
 *  (a seeded App Review account is the renter or owner; the expiry job skips
 *  those bookings too) skips both checks, so the demo booking stays payable. */
export function assertPaymentWindowOpen(
  booking: { depositAmount: unknown; startDate: Date },
  now: number = Date.now(),
  opts: { reviewerDemo?: boolean } = {}
) {
  if (!opts.reviewerDemo) assertNotExpired(booking, now)
  const opensAt = opts.reviewerDemo ? null : paymentOpensAt({ depositAmount: Number(booking.depositAmount), startDate: booking.startDate }, now)
  if (opensAt) {
    throw new ConflictError(`You can pay from ${formatDateTime(opensAt)}.`)
  }
}

/** Postgres deadlock (40P01) or serialization failure (40001); Prisma's P2034. */
export function isLockConflict(err: unknown) {
  const e = err as { code?: unknown; message?: unknown; meta?: { code?: unknown } } | null
  return e?.code === 'P2034' || e?.meta?.code === '40P01' || e?.meta?.code === '40001' || /\b(40P01|40001)\b/.test(String(e?.message ?? ''))
}

/** P3-5: two overlapping accepts at once each lock their own booking, then the
 *  listing, then try to auto-decline the other: Postgres aborts one as a
 *  deadlock. It is run once more (it then sees the other's result, usually a
 *  409 from the version check); a second lock conflict is a 409, not a 500. */
export async function retryOnceOnLockConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!isLockConflict(err)) throw err
  }
  try {
    return await run()
  } catch (err) {
    if (isLockConflict(err)) throw new ConflictError('This booking was updated by someone else. Please refresh and try again.')
    throw err
  }
}
