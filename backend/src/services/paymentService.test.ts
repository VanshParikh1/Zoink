import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCommission,
  calculateOwnerPayout,
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

