// Security-deposit rules for the pilot, shared so the listing form, the
// booking calendar and the Pay screen enforce exactly what the backend does.
//
// Why the limits: the deposit is a card authorization (a separate manual-
// capture PaymentIntent) created when the renter pays, and it has to stay
// valid until the return plus the 24-hour dispute window. Card networks only
// honour an uncaptured authorization for about 7 days (about 5 for some Visa
// transactions). Paying no earlier than 00:00 Toronto on the start day, renting
// for at most 3 days, and the overdue deadline at the end of the day after the
// last rental day (D-1) keeps the hold at most 4 days old at that deadline,
// leaving the admin about 2 days to close out or resolve a dispute.
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

/** How long before the rental starts a booking with a deposit can be paid:
 *  0, i.e. from 00:00 Toronto on the start day (was 24; see the note above). */
export const DEPOSIT_PAY_WINDOW_HOURS = 0

/** The suggested deposit for an item value: 30%, in whole dollars. */
export function suggestedDeposit(itemValue: number): number {
  if (!Number.isFinite(itemValue) || itemValue <= 0) return 0
  return Math.round(itemValue * DEPOSIT_SUGGESTED_RATE)
}

/** When a booking with a deposit can first be paid: DEPOSIT_PAY_WINDOW_HOURS
 *  before the rental starts (00:00 Toronto time on its first day). */
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
