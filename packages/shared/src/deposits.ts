// Security-deposit rules for the pilot, shared so the listing form, the
// booking calendar and the Pay screen enforce exactly what the backend does.
//
// Why the limits: the deposit is a card authorization (a separate manual-
// capture PaymentIntent) created when the renter pays, and it has to stay
// valid until the return plus the 24-hour dispute window. Card networks only
// honour an uncaptured authorization for about 7 days (about 5 for some Visa
// transactions). Paying no earlier than 1 day before the start, renting for at
// most 3 days and resolving within DEPOSIT_HOLD_HOURS after the return keeps
// the whole hold inside about 5 days.
import { cancellationCutoff, type DateInput } from './dates'

/** Highest item value a listing can declare, in dollars. */
export const ITEM_VALUE_MAX = 1000

/** The deposit the listing form suggests, as a share of the item value. */
export const DEPOSIT_SUGGESTED_RATE = 0.3

/** Smallest deposit, in dollars, when there is one (Stripe can't hold less
 *  than $0.50, and a deposit under $1 protects nothing). */
export const DEPOSIT_MIN = 1

/** Longest rental, in calendar days, for a listing with a deposit. */
export const DEPOSIT_MAX_RENTAL_DAYS = 3

/** How long before the rental starts a booking with a deposit can be paid. */
export const DEPOSIT_PAY_WINDOW_HOURS = 24

/** The suggested deposit for an item value: 30%, in whole dollars. */
export function suggestedDeposit(itemValue: number): number {
  if (!Number.isFinite(itemValue) || itemValue <= 0) return 0
  return Math.round(itemValue * DEPOSIT_SUGGESTED_RATE)
}

/** When a booking with a deposit can first be paid: 24 hours before the
 *  rental starts (00:00 Toronto time on its first day). */
export function depositPayableFrom(startDate: DateInput): Date | null {
  const start = cancellationCutoff(startDate)
  return start ? new Date(start.getTime() - DEPOSIT_PAY_WINDOW_HOURS * 60 * 60 * 1000) : null
}

/** Null when the booking can be paid now; otherwise the time it can be. A
 *  booking without a deposit can be paid any time. */
export function paymentOpensAt(booking: { depositAmount: number | string; startDate: DateInput }, now: DateInput = Date.now()): Date | null {
  if (!(Number(booking.depositAmount) > 0)) return null
  const opens = depositPayableFrom(booking.startDate)
  const nowMs = new Date(now).getTime()
  return opens && nowMs < opens.getTime() ? opens : null
}
