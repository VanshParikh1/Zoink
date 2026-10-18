import test from 'node:test'
import assert from 'node:assert/strict'
import { assertBookingTransition, InvalidBookingTransitionError } from './bookingStateMachine'

test('allows valid booking transitions', () => {
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'ACCEPTED'))
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'DECLINED'))
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('ACCEPTED', 'CONFIRMED'))
  assert.doesNotThrow(() => assertBookingTransition('ACCEPTED', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('CONFIRMED', 'ACTIVE'))
  assert.doesNotThrow(() => assertBookingTransition('CONFIRMED', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('ACTIVE', 'COMPLETED'))
})

test('rejects invalid booking transitions', () => {
  const invalid = (error: unknown) =>
    error instanceof InvalidBookingTransitionError && error.statusCode === 409 && error.code === 'BOOKING_INVALID_TRANSITION'
  assert.throws(() => assertBookingTransition('PENDING', 'COMPLETED'), invalid)
  assert.throws(() => assertBookingTransition('DECLINED', 'ACCEPTED'), invalid)
  assert.throws(() => assertBookingTransition('CANCELLED', 'ACTIVE'), invalid)
  assert.throws(() => assertBookingTransition('COMPLETED', 'CANCELLED'), invalid)
  assert.throws(() => assertBookingTransition('ACCEPTED', 'ACTIVE'), invalid)
})
