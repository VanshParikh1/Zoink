import test from 'node:test'
import assert from 'node:assert/strict'
import { assertBookingTransition } from './bookingStateMachine'

test('allows valid booking transitions', () => {
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'ACCEPTED'))
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'DECLINED'))
  assert.doesNotThrow(() => assertBookingTransition('PENDING', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('ACCEPTED', 'ACTIVE'))
  assert.doesNotThrow(() => assertBookingTransition('ACCEPTED', 'CANCELLED'))
  assert.doesNotThrow(() => assertBookingTransition('ACTIVE', 'COMPLETED'))
})

test('rejects invalid booking transitions', () => {
  assert.throws(() => assertBookingTransition('PENDING', 'COMPLETED'), /BOOKING_INVALID_TRANSITION/)
  assert.throws(() => assertBookingTransition('DECLINED', 'ACCEPTED'), /BOOKING_INVALID_TRANSITION/)
  assert.throws(() => assertBookingTransition('CANCELLED', 'ACTIVE'), /BOOKING_INVALID_TRANSITION/)
  assert.throws(() => assertBookingTransition('COMPLETED', 'CANCELLED'), /BOOKING_INVALID_TRANSITION/)
})
