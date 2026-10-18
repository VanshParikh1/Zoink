import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMMISSION_TIERS,
  calculateCommission,
  calculateOwnerPayout,
  getCommissionRate,
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

test('commission is tiered by daily rate: 15% up to $20, 12.5% up to $50, 10% above', () => {
  assert.deepEqual(COMMISSION_TIERS, [
    { maxDailyRate: 20, rate: 0.15 },
    { maxDailyRate: 50, rate: 0.125 },
    { maxDailyRate: Infinity, rate: 0.1 },
  ])
  assert.equal(getCommissionRate(0.01), 0.15)
  assert.equal(getCommissionRate(20), 0.15, '$20/day exactly is still 15%')
  assert.equal(getCommissionRate(20.01), 0.125)
  assert.equal(getCommissionRate(50), 0.125, '$50/day exactly is still 12.5%')
  assert.equal(getCommissionRate(50.01), 0.1)
  assert.equal(getCommissionRate(1000), 0.1)
})

test('the bracket is the daily rate, never the booking total', () => {
  // A 7-day rental of a $15/day item is $105 but stays in the 15% tier.
  assert.equal(calculateCommission(105, 15), 15.75)
  assert.equal(calculateOwnerPayout(105, 15), 89.25)
  assert.equal(calculateCommission(100, 25), 12.5)
  assert.equal(calculateCommission(420, 60), 42)
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
  let ties = 0
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

      // Rounding: the binary-float formula matches exact half-up rounding,
      // except that on an exact half cent it can land on either side.
      const rate = getCommissionRate(dailyPrice)
      const [num, den] = rate === 0.15 ? [15, 100] : rate === 0.125 ? [125, 1000] : [1, 10]
      const exactCommission = halfUp(totalCents * num, den)
      const exactHst = halfUp(totalCents * 13, 100)
      const commissionDiff = Math.abs(cents(q.commissionAmount) - exactCommission)
      const hstDiff = Math.abs(cents(q.hstAmount) - exactHst)
      assert.ok(commissionDiff <= 1 && hstDiff <= 1)
      if (commissionDiff === 1) {
        assert.equal(((totalCents * num) % den) * 2, den, 'a 1-cent difference only happens on a half-cent tie')
        ties += 1
      }
      if (hstDiff === 1) {
        assert.equal(((totalCents * 13) % 100) * 2, 100, 'a 1-cent HST difference only happens on a half-cent tie')
        ties += 1
      }
    }
  }
  // How often float rounding and exact half-up disagree by a cent on a tie,
  // across all 700,000 quotes (recorded in docs/hardening-log.md).
  if (process.env.REPORT_ROUNDING_TIES) console.log(`half-cent ties rounded differently: ${ties}`)
})

test('roundCurrency rounds to the cent', () => {
  assert.equal(roundCurrency(0.1 + 0.2), 0.3)
  assert.equal(roundCurrency(12.345678), 12.35)
  assert.equal(roundCurrency(7), 7)
})
