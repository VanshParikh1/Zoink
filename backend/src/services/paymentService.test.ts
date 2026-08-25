import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCommissionRate,
  calculateCommission,
  calculateOwnerPayout,
  calculateHst,
} from './paymentService'

test('getCommissionRate — tier 1 ($0-$20/day) is 15%', () => {
  assert.equal(getCommissionRate(0), 0.15)
  assert.equal(getCommissionRate(1), 0.15)
  assert.equal(getCommissionRate(19.99), 0.15)
})

test('getCommissionRate — tier 2 ($20-$50/day) is 12.5%', () => {
  assert.equal(getCommissionRate(20.01), 0.125)
  assert.equal(getCommissionRate(35), 0.125)
  assert.equal(getCommissionRate(49.99), 0.125)
})

test('getCommissionRate — tier 3 ($50+/day) is 10%', () => {
  assert.equal(getCommissionRate(50.01), 0.1)
  assert.equal(getCommissionRate(100), 0.1)
  assert.equal(getCommissionRate(999), 0.1)
})

test('getCommissionRate — boundary: exactly $20/day stays in the 15% tier', () => {
  assert.equal(getCommissionRate(20), 0.15)
})

test('getCommissionRate — boundary: exactly $50/day stays in the 12.5% tier', () => {
  assert.equal(getCommissionRate(50), 0.125)
})

test('calculateCommission applies the bracket to the FULL rental total, not per day', () => {
  // $10/day x 10 days = $100 total, but the bracket is keyed on the $10/day
  // rate (tier 1, 15%) — not recomputed from the $100 total, which alone
  // would still be tier 1 here anyway, so also check a case where the two
  // would disagree if commission were wrongly bracketed on total instead:
  // $60/day x 1 day = $60 total. Total-based bracketing would still land in
  // tier 3, so use a case where a long cheap rental produces a total that
  // LOOKS like a tier-3 rental: $15/day x 10 days = $150 total.
  const commission = calculateCommission(150, 15)
  assert.equal(commission, 22.5, '15% of $150 (tier 1, from the $15/day rate) = $22.50, not 10% ($15)')
})

test('calculateCommission — tier 1 example', () => {
  assert.equal(calculateCommission(100, 20), 15) // $20/day, $100 total -> 15%
})

test('calculateCommission — tier 2 example', () => {
  assert.equal(calculateCommission(100, 30), 12.5) // $30/day, $100 total -> 12.5%
})

test('calculateCommission — tier 3 example', () => {
  assert.equal(calculateCommission(100, 60), 10) // $60/day, $100 total -> 10%
})

test('calculateOwnerPayout is totalPrice minus the tiered commission', () => {
  assert.equal(calculateOwnerPayout(100, 20), 85)
  assert.equal(calculateOwnerPayout(100, 30), 87.5)
  assert.equal(calculateOwnerPayout(100, 60), 90)
})

test('calculateHst is 13% of the rental price', () => {
  assert.equal(calculateHst(100), 13)
  assert.equal(calculateHst(0), 0)
  assert.equal(calculateHst(150), 19.5)
})

test('calculateHst does not affect commission or ownerPayout math', () => {
  // HST is purely additive on top of what the borrower pays — it must never
  // be subtracted from totalPrice before commission/ownerPayout are derived,
  // and calculateCommission/calculateOwnerPayout take no hst-related input
  // at all, so this mostly documents the invariant: computing HST alongside
  // commission for the same totalPrice/dailyRate must not change either.
  const totalPrice = 200
  const dailyRate = 30
  const commissionBefore = calculateCommission(totalPrice, dailyRate)
  const payoutBefore = calculateOwnerPayout(totalPrice, dailyRate)

  const hst = calculateHst(totalPrice)
  assert.equal(hst, 26)

  assert.equal(calculateCommission(totalPrice, dailyRate), commissionBefore)
  assert.equal(calculateOwnerPayout(totalPrice, dailyRate), payoutBefore)
  assert.equal(commissionBefore, 25, '12.5% of $200 (tier 2, $30/day) = $25, unaffected by HST')
  assert.equal(payoutBefore, 175, '$200 - $25 commission = $175, unaffected by HST')
})
