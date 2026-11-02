// Zoink's commission on a rental, shared so the app can preview what an owner
// keeps with exactly the backend's math (backend/src/services/paymentService.ts
// wraps these for Prisma.Decimal inputs).

// Pilot model: a flat 15% of the rental subtotal (daily price x days, before
// HST), with a $2.00 minimum per rental. It is taken from the owner's payout;
// the renter pays no fee on top, and deposits are never commissioned. The
// commission is computed once, at booking-request time, alongside every other
// snapshotted price field (see createBooking() in bookingService.ts); it is
// never recomputed for an existing booking.
export const COMMISSION_RATE = 0.15
export const COMMISSION_MIN_CENTS = 200

/** Whole cents in a dollar amount that is already rounded to the cent. */
export function dollarsToCents(value: number) {
  return Math.round(value * 100)
}

/** `cents x rate`, rounded half-up to a whole cent in integer arithmetic. The
 *  rate goes in as basis points (0.125 -> 1250), so an exact half cent always
 *  rounds up; the float formula this replaced (Math.round(x * rate * 100))
 *  rounded some exact half cents down, depending on how the product landed in
 *  binary. */
export function applyRateHalfUp(cents: number, rate: number) {
  const basisPoints = Math.round(rate * 10_000)
  return Math.floor((cents * basisPoints + 5_000) / 10_000)
}

/** The commission in whole cents on a rental subtotal in whole cents: 15%
 *  half-up, at least $2.00, and never more than the subtotal itself (a rental
 *  under $2 is commissioned at its full subtotal, so the owner keeps $0). */
export function calculateCommissionCents(subtotalCents: number) {
  if (subtotalCents <= 0) return 0
  const percentage = applyRateHalfUp(subtotalCents, COMMISSION_RATE)
  return Math.min(subtotalCents, Math.max(COMMISSION_MIN_CENTS, percentage))
}

/** The commission in dollars on a rental subtotal in dollars. */
export function calculateCommission(totalPrice: number) {
  return calculateCommissionCents(dollarsToCents(totalPrice)) / 100
}

/** What the owner keeps of a rental subtotal: the subtotal minus the commission. */
export function calculateOwnerPayout(totalPrice: number) {
  const cents = dollarsToCents(totalPrice)
  return (cents - calculateCommissionCents(cents)) / 100
}

/** True when the $2 minimum (not 15%) set the commission on this subtotal. */
export function commissionIsMinimum(totalPrice: number) {
  const cents = dollarsToCents(totalPrice)
  return cents > 0 && calculateCommissionCents(cents) > applyRateHalfUp(cents, COMMISSION_RATE)
}
