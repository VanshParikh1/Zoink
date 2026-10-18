import test from 'node:test'
import assert from 'node:assert/strict'
import { assertBookingTransition, InvalidBookingTransitionError } from './bookingStateMachine'

test('allows valid booking transitions', () => {
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'ACCEPTED'))
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'DECLINED'))
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('ACCEPTED', 'CONFIRMED'))
  assert.doesNotThrow(() => assertBookingTransition('ACCEPTED', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('CONFIRMED', 'PICKUP_PENDING'))
  assert.doesNotThrow(() => assertBookingTransition('CONFIRMED', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('PICKUP_PENDING', 'ACTIVE'))
  assert.doesNotThrow(() => assertBookingTransition('PICKUP_PENDING', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('ACTIVE', 'RETURN_PENDING'))
  assert.doesNotThrow(() => assertBookingTransition('RETURN_PENDING', 'COMPLETED'))
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

test('no handoff step can be skipped', () => {
  const invalid = (error: unknown) => error instanceof InvalidBookingTransitionError
  assert.throws(() => assertBookingTransition('CONFIRMED', 'ACTIVE'), invalid)
  assert.throws(() => assertBookingTransition('ACTIVE', 'COMPLETED'), invalid)
  assert.throws(() => assertBookingTransition('ACTIVE', 'CANCELLED'), invalid)
  assert.throws(() => assertBookingTransition('RETURN_PENDING', 'CANCELLED'), invalid)
})
