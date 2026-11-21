// What a rental costs, shared so the request screen's preview is computed with
// exactly the formulas the backend snapshots onto the booking
// (bookingService.createBooking) and charges (paymentService).
import { calculateCommission, calculateOwnerPayout } from './commission'

/** Lowest daily price a listing can have, in dollars. A product floor that
 *  also keeps every rental well above Stripe's $0.50 minimum charge. */
export const DAILY_PRICE_MIN = 5

/** Rounds to whole cents the way every money field on a booking is rounded. */
export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export type RentalQuote = {
  rentalDays: number
  totalPrice: number
  /** Always 0: no HST is charged (D-2). Kept because bookings.hstAmount is
   *  snapshotted from it; older bookings may hold a non-zero amount. */
  hstAmount: number
  commissionAmount: number
  ownerPayout: number
  depositAmount: number
  /** The rent: authorized when the renter pays, captured at pickup. */
  chargedAtPickup: number
}

/** The price lines for `rentalDays` days at `dailyPrice`. Insurance is not
 *  offered (terms.md §12), so it never appears here. */
export function quoteRental(dailyPrice: number, rentalDays: number, depositAmount = 0): RentalQuote {
  const totalPrice = roundCurrency(dailyPrice * rentalDays)
  return {
    rentalDays,
    totalPrice,
    hstAmount: 0,
    commissionAmount: calculateCommission(totalPrice),
    ownerPayout: calculateOwnerPayout(totalPrice),
    depositAmount,
    chargedAtPickup: totalPrice,
  }
}
