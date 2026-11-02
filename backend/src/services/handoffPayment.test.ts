import test from 'node:test'
import assert from 'node:assert/strict'
import { assertPickupPaymentReady, PickupPaymentRequiredError } from './handoffService'

const paid = { paymentStatus: 'AUTHORIZED', depositAmount: 0, depositStatus: null }

test('pickup goes ahead once the rent is authorized and there is no deposit', () => {
  assert.doesNotThrow(() => assertPickupPaymentReady(paid))
  // A capture retried after a lost response finds it already captured.
  assert.doesNotThrow(() => assertPickupPaymentReady({ ...paid, paymentStatus: 'CAPTURED' }))
})

test('pickup is refused while the rent is not authorized', () => {
  for (const paymentStatus of ['PENDING_AUTH', 'FAILED', 'REFUNDED', 'REFUND_PENDING']) {
    assert.throws(
      () => assertPickupPaymentReady({ ...paid, paymentStatus }),
      (error: any) =>
        error instanceof PickupPaymentRequiredError &&
        error.statusCode === 409 &&
        error.code === 'PICKUP_PAYMENT_REQUIRED' &&
        error.message === "Payment hasn't gone through. The renter needs to pay before pickup.",
      paymentStatus,
    )
  }
})

test('with a deposit, pickup also needs the deposit hold authorized', () => {
  const withDeposit = { ...paid, depositAmount: '50.00' }
  assert.doesNotThrow(() => assertPickupPaymentReady({ ...withDeposit, depositStatus: 'AUTHORIZED' }))
  for (const depositStatus of [null, 'RELEASED', 'CAPTURED']) {
    assert.throws(() => assertPickupPaymentReady({ ...withDeposit, depositStatus }), PickupPaymentRequiredError, String(depositStatus))
  }
})
