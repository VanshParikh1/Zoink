import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as reviewService from '../../services/reviewService'
import { submitReview } from './reviewController'
import { createMockResponse } from '../../testUtils/httpMocks'

const originalSubmitReview = reviewService.submitReview

afterEach(() => {
  ;(reviewService as any).submitReview = originalSubmitReview
})

test('submitReview returns 400 when obligationId is missing', async () => {
  const req: any = {
    userId: 'user-1',
    body: { scoreA: 5, scoreB: 5, scoreC: 5 },
  }
  const res = createMockResponse()

  await submitReview(req, res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'obligationId is required.' })
})

test('submitReview maps invalid scores to 400', async () => {
  ;(reviewService as any).submitReview = async () => {
    throw new Error('REVIEW_INVALID_SCORE')
  }

  const req: any = {
    userId: 'user-1',
    body: {
      obligationId: 'review-1',
      scoreA: 9,
      scoreB: 5,
      scoreC: 3,
    },
  }
  const res = createMockResponse()

  await submitReview(req, res as any)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    error: 'Scores must be whole numbers between 1 and 5.',
  })
})
