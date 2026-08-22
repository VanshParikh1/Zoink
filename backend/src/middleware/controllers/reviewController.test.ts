import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as reviewService from '../../services/reviewService'
import { submitReview } from './reviewController'
import { createMockResponse } from '../../testUtils/httpMocks'
import { BadRequestError } from '../../utils/errors'
import { errorHandler } from '../errorHandler'
import { validate } from '../validate'
import { SubmitReviewSchema } from '../../schemas/review.schema'

function runValidate(body: Record<string, unknown>) {
  const req: any = { body, params: {}, query: {} }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(SubmitReviewSchema)(req, res as any, next)

  return { req, res, capturedError }
}

const validReviewBody = {
  obligationId: '11111111-1111-4111-8111-111111111111',
  reviewerRole: 'RENTER',
  scoreA: 5,
  scoreB: 4,
  scoreC: 3,
  itemRating: 4,
}

test('validate(SubmitReviewSchema) accepts a well-formed review', () => {
  const { capturedError } = runValidate(validReviewBody)
  assert.ok(!capturedError, 'should not raise a ZodError')
})

test('validate(SubmitReviewSchema) rejects a non-UUID obligationId', () => {
  const { capturedError, req, res } = runValidate({ ...validReviewBody, obligationId: 'not-a-uuid' })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.obligationId'), 'should flag a non-UUID obligationId')
})

for (const key of ['scoreA', 'scoreB', 'scoreC', 'itemRating'] as const) {
  test(`validate(SubmitReviewSchema) rejects ${key} below 1`, () => {
    const { capturedError, req, res } = runValidate({ ...validReviewBody, [key]: 0 })

    assert.ok(capturedError, 'ZodError should be passed to next()')
    errorHandler(capturedError, req, res as any, () => {})

    assert.equal(res.statusCode, 400)
    const paths = (res.body as any).issues.map((i: any) => i.path)
    assert.ok(paths.includes(`body.${key}`), `should flag ${key} below 1`)
  })

  test(`validate(SubmitReviewSchema) rejects ${key} above 5`, () => {
    const { capturedError, req, res } = runValidate({ ...validReviewBody, [key]: 6 })

    assert.ok(capturedError, 'ZodError should be passed to next()')
    errorHandler(capturedError, req, res as any, () => {})

    assert.equal(res.statusCode, 400)
    const paths = (res.body as any).issues.map((i: any) => i.path)
    assert.ok(paths.includes(`body.${key}`), `should flag ${key} above 5`)
  })

  test(`validate(SubmitReviewSchema) rejects a non-integer ${key}`, () => {
    const { capturedError, req, res } = runValidate({ ...validReviewBody, [key]: 3.5 })

    assert.ok(capturedError, 'ZodError should be passed to next()')
    errorHandler(capturedError, req, res as any, () => {})

    assert.equal(res.statusCode, 400)
    const paths = (res.body as any).issues.map((i: any) => i.path)
    assert.ok(paths.includes(`body.${key}`), `should flag a non-integer ${key}`)
  })
}

test('validate(SubmitReviewSchema) rejects itemNotes over 280 characters', () => {
  const { capturedError, req, res } = runValidate({ ...validReviewBody, itemNotes: 'C'.repeat(281) })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.itemNotes'), 'should flag itemNotes over 280 characters')
})

test('validate(SubmitReviewSchema) rejects a RENTER reviewer with no itemRating', () => {
  const { itemRating, ...withoutItemRating } = validReviewBody
  const { capturedError } = runValidate(withoutItemRating)
  assert.ok(capturedError, 'ZodError should be passed to next()')
})

test('validate(SubmitReviewSchema) rejects a LENDER reviewer submitting itemRating', () => {
  const { capturedError } = runValidate({ ...validReviewBody, reviewerRole: 'LENDER' })
  assert.ok(capturedError, 'ZodError should be passed to next() when a LENDER submits itemRating')
})

test('validate(SubmitReviewSchema) rejects a RENTER reviewer submitting personNotes', () => {
  const { capturedError } = runValidate({ ...validReviewBody, personNotes: 'Great renter!' })
  assert.ok(capturedError, 'ZodError should be passed to next() when a RENTER submits personNotes')
})

test('validate(SubmitReviewSchema) accepts a well-formed LENDER review with personNotes', () => {
  const { itemRating, ...rest } = validReviewBody
  const { capturedError } = runValidate({ ...rest, reviewerRole: 'LENDER', personNotes: 'Great renter!' })
  assert.ok(!capturedError, 'should not raise a ZodError')
})

test('validate(SubmitReviewSchema) rejects personNotes over 280 characters', () => {
  const { itemRating, ...rest } = validReviewBody
  const { capturedError, req, res } = runValidate({ ...rest, reviewerRole: 'LENDER', personNotes: 'C'.repeat(281) })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.personNotes'), 'should flag personNotes over 280 characters')
})

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
  const next = (err: any) => {}

  await submitReview(req, res as any, next)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'obligationId is required.' })
})

test('submitReview maps invalid scores to 400', async () => {
  ;(reviewService as any).submitReview = async () => {
    throw new BadRequestError('Scores must be whole numbers between 1 and 5.')
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
  let nextCalledWith: any = null
  const next = (err: any) => { nextCalledWith = err }

  await submitReview(req, res as any, next)

  if (nextCalledWith) {
    errorHandler(nextCalledWith, req, res as any, () => {})
  }

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, {
    error: 'Scores must be whole numbers between 1 and 5.',
  })
})
