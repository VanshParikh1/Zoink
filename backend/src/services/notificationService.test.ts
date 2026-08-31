import { test, describe } from 'node:test'
import assert from 'node:assert'
import { userWantsNotification } from './notificationService'

const allOn = {
  notifyMessages: true,
  notifyBookingActivity: true,
  notifyPaymentsPayouts: true,
  notifyDepositUpdates: true,
  notifyReviews: true,
}

describe('userWantsNotification', () => {
  test('maps each toggleable type to its category column', () => {
    assert.equal(userWantsNotification({ ...allOn, notifyMessages: false }, 'MESSAGE_RECEIVED'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyBookingActivity: false }, 'BOOKING_REQUEST'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyBookingActivity: false }, 'BOOKING_ACCEPTED'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyBookingActivity: false }, 'BOOKING_DECLINED'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyBookingActivity: false }, 'BOOKING_CANCELLED'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyPaymentsPayouts: false }, 'PAYMENT_RECEIVED'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyPaymentsPayouts: false }, 'PAYOUT_SENT'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyDepositUpdates: false }, 'DEPOSIT_RELEASED'), false)
    assert.equal(userWantsNotification({ ...allOn, notifyReviews: false }, 'REVIEW_RECEIVED'), false)
  })

  test('a category left on does not suppress its types', () => {
    assert.equal(userWantsNotification(allOn, 'MESSAGE_RECEIVED'), true)
    assert.equal(userWantsNotification(allOn, 'DEPOSIT_RELEASED'), true)
  })

  test('verification types are never gated by a toggle', () => {
    const allOff = {
      notifyMessages: false,
      notifyBookingActivity: false,
      notifyPaymentsPayouts: false,
      notifyDepositUpdates: false,
      notifyReviews: false,
    }
    assert.equal(userWantsNotification(allOff, 'VERIFICATION_APPROVED'), true)
    assert.equal(userWantsNotification(allOff, 'VERIFICATION_FAILED'), true)
  })
})
