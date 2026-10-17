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

export function calculateCommission(totalPrice: number, dailyRate: number) {
  return Math.round(totalPrice * getCommissionRate(dailyRate) * 100) / 100
}

export function calculateOwnerPayout(totalPrice: number, dailyRate: number) {
  return Math.round((totalPrice - calculateCommission(totalPrice, dailyRate)) * 100) / 100
}
