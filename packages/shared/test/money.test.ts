import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMMISSION_MIN_CENTS,
  COMMISSION_RATE,
  calculateCommission,
  calculateCommissionCents,
  calculateOwnerPayout,
  commissionIsMinimum,
} from '../src/commission'
import { HST_RATE, calculateHst, quoteRental, roundCurrency } from '../src/pricing'
import {
  DEPOSIT_HOLD_HOURS,
  HANDOFF_PHOTOS_MAX,
  HANDOFF_PHOTOS_MIN,
  LISTING_PHOTOS_MAX,
  PAYOUT_HOLD_HOURS,
  ZOINK_TAP_WINDOW_MS,
} from '../src/bookingWindows'

// These pin business rules (see docs/hardening-report.md, "Invariants"). A
// failure here means a contract term or the revenue model changed: that needs a
// product decision and a terms update, not a test edit.

const cents = (value: number) => Math.round(value * 100)

test('commission is a flat 15% of the rental subtotal with a $2.00 minimum', () => {
  assert.equal(COMMISSION_RATE, 0.15)
  assert.equal(COMMISSION_MIN_CENTS, 200)
  // The daily price no longer matters: only the subtotal does.
  assert.equal(calculateCommission(105), 15.75)
  assert.equal(calculateOwnerPayout(105), 89.25)
  assert.equal(calculateCommission(100), 15)
  assert.equal(calculateCommission(420), 63)
  assert.equal(calculateOwnerPayout(420), 357)
})

test('the $2 minimum: boundary at a $13.33 subtotal', () => {
  // 15% of $13.33 is 199.95 cents -> 200 half-up, exactly the minimum.
  assert.equal(calculateCommission(13.33), 2)
  assert.equal(commissionIsMinimum(13.33), false)
  // 15% of $13.32 is 199.8 cents -> 200 half-up as well: still $2.
  assert.equal(calculateCommission(13.32), 2)
  // 15% of $13.30 is 199.5 -> 200; $13.29 is 199.35 -> 199, so the minimum lifts it.
  assert.equal(calculateCommission(13.29), 2)
  assert.equal(commissionIsMinimum(13.29), true)
  // Above the boundary the percentage takes over.
  assert.equal(calculateCommission(13.37), 2.01)
  assert.equal(calculateCommission(13.4), 2.01)
  assert.equal(commissionIsMinimum(13.4), false)
  assert.equal(calculateOwnerPayout(13.33), 11.33)
})

test('tiny subtotals: the commission never exceeds the subtotal', () => {
  assert.equal(calculateCommission(0), 0)
  assert.equal(calculateOwnerPayout(0), 0)
  assert.equal(calculateCommission(0.01), 0.01)
  assert.equal(calculateOwnerPayout(0.01), 0)
  assert.equal(calculateCommission(1), 1)
  assert.equal(calculateOwnerPayout(1), 0)
  assert.equal(calculateCommission(1.99), 1.99)
  assert.equal(calculateCommission(2), 2)
  assert.equal(calculateOwnerPayout(2), 0)
  assert.equal(calculateCommission(5), 2)
  assert.equal(calculateOwnerPayout(5), 3)
  assert.equal(calculateCommissionCents(-100), 0)
})

test('large subtotals: plain 15%, in whole cents', () => {
  // The listing cap ($1,000/day) x the longest rental (7 days).
  assert.equal(calculateCommission(7000), 1050)
  assert.equal(calculateOwnerPayout(7000), 5950)
  assert.equal(calculateCommission(999.99), 150)
  assert.equal(calculateOwnerPayout(999.99), 849.99)
})

test('HST is 13% of the rental price only', () => {
  assert.equal(HST_RATE, 0.13)
  assert.equal(calculateHst(100), 13)
  const quote = quoteRental(20, 5, 150)
  assert.equal(quote.totalPrice, 100)
  assert.equal(quote.hstAmount, 13, 'the deposit is not taxed')
  assert.equal(quote.chargedAtPickup, 113, 'the deposit is not part of what is captured at pickup')
  assert.equal(quote.depositAmount, 150)
})

test('contract windows and limits', () => {
  assert.equal(DEPOSIT_HOLD_HOURS, 24)
  assert.equal(PAYOUT_HOLD_HOURS, 24)
  assert.equal(ZOINK_TAP_WINDOW_MS, 5 * 60 * 1000)
  assert.equal(HANDOFF_PHOTOS_MIN, 2)
  assert.equal(HANDOFF_PHOTOS_MAX, 3)
  assert.equal(LISTING_PHOTOS_MAX, 8)
})

// Exact half-up rounding of `numerator / denominator` cents, in integers.
function halfUp(numerator: number, denominator: number) {
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}

// Every daily price from $0.01 to $1,000.00 (the listing schema's cap), for
// every rental length up to the 7-day maximum: 700,000 quotes.
test('property: every quote is whole cents and its lines add up exactly', () => {
  for (let dailyCents = 1; dailyCents <= 100_000; dailyCents += 1) {
    const dailyPrice = dailyCents / 100
    for (let days = 1; days <= 7; days += 1) {
      const q = quoteRental(dailyPrice, days)
      const totalCents = cents(q.totalPrice)

      // Rental total is exactly daily rate x days.
      assert.equal(totalCents, dailyCents * days)
      for (const field of [q.totalPrice, q.hstAmount, q.commissionAmount, q.ownerPayout, q.chargedAtPickup] as const) {
        assert.ok(Math.abs(field * 100 - Math.round(field * 100)) < 1e-6, `${field} is not whole cents`)
      }

      // The platform's cut and the owner's payout are the whole rental total.
      assert.equal(cents(q.commissionAmount) + cents(q.ownerPayout), totalCents)
      assert.ok(q.commissionAmount >= 0 && q.ownerPayout <= q.totalPrice)

      // What the renter is charged at pickup is rent + HST, to the cent.
      assert.equal(cents(q.chargedAtPickup), totalCents + cents(q.hstAmount))

      // Rounding: commission and HST are exact half-up to the cent, including
      // on an exact half cent (the float formula used to round some down).
      assert.equal(cents(q.commissionAmount), Math.min(totalCents, Math.max(200, halfUp(totalCents * 15, 100))))
      assert.equal(cents(q.hstAmount), halfUp(totalCents * 13, 100))
    }
  }
})

test('an exact half cent rounds up', () => {
  // $0.50 of rent at 13% HST is 6.5 cents, a product the float formula could
  // round either way.
  const q = quoteRental(0.5, 1)
  assert.equal(q.hstAmount, 0.07)
  // $20.50 x 1 day at 15%: 307.5 cents -> $3.08, payout $17.42.
  assert.equal(calculateCommission(20.5), 3.08)
  assert.equal(calculateOwnerPayout(20.5), 17.42)
})

test('roundCurrency rounds to the cent', () => {
  assert.equal(roundCurrency(0.1 + 0.2), 0.3)
  assert.equal(roundCurrency(12.345678), 12.35)
  assert.equal(roundCurrency(7), 7)
})
