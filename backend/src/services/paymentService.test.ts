import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCommission,
  calculateOwnerPayout,
  calculateHst,
} from './paymentService'

test('calculateCommission is a flat 15% of the rental subtotal', () => {
  assert.equal(calculateCommission(100), 15)
  assert.equal(calculateCommission(150), 22.5)
  // The daily rate no longer changes the rate: $60/day x 1 day is still 15%.
  assert.equal(calculateCommission(60), 9)
})

test('calculateCommission has a $2.00 minimum, capped at the subtotal', () => {
  assert.equal(calculateCommission(13.33), 2) // 199.95 cents rounds to the minimum exactly
  assert.equal(calculateCommission(10), 2) // 15% would be $1.50
  assert.equal(calculateCommission(1.5), 1.5) // never more than the subtotal
  assert.equal(calculateCommission(0), 0)
})

test('calculateOwnerPayout is totalPrice minus the commission', () => {
  assert.equal(calculateOwnerPayout(100), 85)
  assert.equal(calculateOwnerPayout(10), 8)
  assert.equal(calculateOwnerPayout(1.5), 0)
  assert.equal(calculateOwnerPayout(7000), 5950)
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
  const commissionBefore = calculateCommission(totalPrice)
  const payoutBefore = calculateOwnerPayout(totalPrice)

  const hst = calculateHst(totalPrice)
  assert.equal(hst, 26)

  assert.equal(calculateCommission(totalPrice), commissionBefore)
  assert.equal(calculateOwnerPayout(totalPrice), payoutBefore)
  assert.equal(commissionBefore, 30, '15% of $200 = $30, unaffected by HST')
  assert.equal(payoutBefore, 170, '$200 - $30 commission = $170, unaffected by HST')
})
