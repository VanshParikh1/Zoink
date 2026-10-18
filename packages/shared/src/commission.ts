// Zoink's commission on a rental, shared so the app can preview what an owner
// keeps with exactly the backend's math (backend/src/services/paymentService.ts
// wraps these for Prisma.Decimal inputs).

// Bracket is keyed on the listing's DAILY rate, not the booking's total value —
// a long rental of a cheap item stays in the cheap-item tier, it doesn't creep
// into a lower rate just because rentalDays pushed totalPrice up. The bracket
// is looked up once (at booking-request time, alongside every other snapshotted
// price field — see createBooking() in bookingService.ts) and applied to the
// full rental total; it is never recomputed per day or re-derived later.
export const COMMISSION_TIERS: { maxDailyRate: number; rate: number }[] = [
  { maxDailyRate: 20, rate: 0.15 },
  { maxDailyRate: 50, rate: 0.125 },
  { maxDailyRate: Infinity, rate: 0.1 },
]

export function getCommissionRate(dailyRate: number): number {
  // Boundaries are inclusive on the lower-rate side ($20/day exactly is still
  // the 15% tier, $50/day exactly is still the 12.5% tier) — the same
  // convention as INSURANCE_RATE's min/max clamp in paymentService.
  const tier = COMMISSION_TIERS.find((t) => dailyRate <= t.maxDailyRate)
  return tier!.rate
}

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

export function calculateCommission(totalPrice: number, dailyRate: number) {
  return applyRateHalfUp(dollarsToCents(totalPrice), getCommissionRate(dailyRate)) / 100
}

export function calculateOwnerPayout(totalPrice: number, dailyRate: number) {
  return (dollarsToCents(totalPrice) - dollarsToCents(calculateCommission(totalPrice, dailyRate))) / 100
}
