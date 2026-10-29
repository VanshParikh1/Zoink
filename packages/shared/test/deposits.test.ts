import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEPOSIT_MAX_RENTAL_DAYS,
  DEPOSIT_MIN,
  DEPOSIT_PAY_WINDOW_HOURS,
  ITEM_VALUE_MAX,
  depositPayableFrom,
  paymentOpensAt,
  suggestedDeposit,
} from '../src/deposits'

test('pilot deposit limits', () => {
  assert.equal(ITEM_VALUE_MAX, 1000)
  assert.equal(DEPOSIT_MIN, 1)
  assert.equal(DEPOSIT_MAX_RENTAL_DAYS, 3)
  assert.equal(DEPOSIT_PAY_WINDOW_HOURS, 24)
})

test('the suggested deposit is 30% of the item value, in whole dollars', () => {
  assert.equal(suggestedDeposit(1000), 300)
  assert.equal(suggestedDeposit(250), 75)
  assert.equal(suggestedDeposit(99), 30) // 29.7
  assert.equal(suggestedDeposit(45), 14) // 13.5 rounds half up
  assert.equal(suggestedDeposit(1), 0)
  assert.equal(suggestedDeposit(0), 0)
  assert.equal(suggestedDeposit(Number.NaN), 0)
})

test('a deposit booking can be paid from 00:00 Toronto time the day before it starts', () => {
  // Start date stored as midnight UTC of Nov 10; the rental starts 00:00 EST
  // (05:00 UTC) Nov 10, so paying opens 05:00 UTC Nov 9.
  assert.equal(depositPayableFrom('2026-11-10T00:00:00.000Z')!.toISOString(), '2026-11-09T05:00:00.000Z')
  // Summer time: 00:00 EDT is 04:00 UTC.
  assert.equal(depositPayableFrom('2026-07-10T00:00:00.000Z')!.toISOString(), '2026-07-09T04:00:00.000Z')
})

test('paymentOpensAt: null when it can be paid now', () => {
  const booking = { depositAmount: 50, startDate: '2026-11-10T00:00:00.000Z' }
  assert.equal(paymentOpensAt(booking, '2026-11-09T04:59:59.000Z')!.toISOString(), '2026-11-09T05:00:00.000Z')
  assert.equal(paymentOpensAt(booking, '2026-11-09T05:00:00.000Z'), null)
  assert.equal(paymentOpensAt(booking, '2026-11-10T12:00:00.000Z'), null)
  // No deposit: any time.
  assert.equal(paymentOpensAt({ ...booking, depositAmount: '0.00' }, '2026-10-01T00:00:00.000Z'), null)
})
