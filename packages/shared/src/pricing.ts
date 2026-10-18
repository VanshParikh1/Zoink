// What a rental costs, shared so the request screen's preview is computed with
// exactly the formulas the backend snapshots onto the booking
// (bookingService.createBooking) and charges (paymentService).
import { applyRateHalfUp, calculateCommission, calculateOwnerPayout, dollarsToCents } from './commission'

// Ontario HST, on the rental price only: not on the deposit (a hold, not a
// sale) and not on insurance. Charged on top of what the renter pays; never
// taken out of the owner's payout.
export const HST_RATE = 0.13

/** Rounds to whole cents the way every money field on a booking is rounded. */
export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function calculateHst(rentalTotalPrice: number) {
  return applyRateHalfUp(dollarsToCents(rentalTotalPrice), HST_RATE) / 100
}

export type RentalQuote = {
  rentalDays: number
  totalPrice: number
  hstAmount: number
  commissionAmount: number
  ownerPayout: number
  depositAmount: number
  /** Rent + HST: authorized when the renter pays, captured at pickup. */
  chargedAtPickup: number
}

/** The price lines for `rentalDays` days at `dailyPrice`. Insurance is not
 *  offered (terms.md §12), so it never appears here. */
export function quoteRental(dailyPrice: number, rentalDays: number, depositAmount = 0): RentalQuote {
  const totalPrice = roundCurrency(dailyPrice * rentalDays)
  const hstAmount = calculateHst(totalPrice)
  return {
    rentalDays,
    totalPrice,
    hstAmount,
    commissionAmount: calculateCommission(totalPrice, dailyPrice),
    ownerPayout: calculateOwnerPayout(totalPrice, dailyPrice),
    depositAmount,
    chargedAtPickup: roundCurrency(totalPrice + hstAmount),
  }
}
