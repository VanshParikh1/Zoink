import test, { describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { paymentOpensAt } from '@zoink/shared'
import { dayOffset } from './seedReviewerAccount'

describe('reviewer seed dates', () => {
  test('seeded at 10:30 pm Toronto, the Pay booking (starting today) is payable now', () => {
    // 2026-11-16 22:30 EST = 2026-11-17 03:30 UTC: the UTC day is already the 17th.
    const now = Date.parse('2026-11-17T03:30:00.000Z')
    mock.timers.enable({ apis: ['Date'], now })
    try {
      const start = dayOffset(0)
      assert.equal(start.toISOString(), '2026-11-16T00:00:00.000Z', 'today in Toronto, as the app sends a day')
      assert.equal(paymentOpensAt({ depositAmount: 20, startDate: start }, now), null)
      assert.equal(dayOffset(1).toISOString(), '2026-11-17T00:00:00.000Z')
    } finally {
      mock.timers.reset()
    }
  })
})
