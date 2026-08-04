import { test, describe, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import { createDispute } from './disputeController'
import { createMockRequest, createMockResponse } from '../../testUtils/httpMocks'
import * as disputeService from '../../services/disputeService'
import { ForbiddenError } from '../../utils/errors'
import { validate } from '../validate'
import { CreateDisputeSchema } from '../../schemas/dispute.schema'
import { errorHandler } from '../errorHandler'

describe('disputeController', () => {
  let mockRes: any

  beforeEach(() => {
    mockRes = createMockResponse()
    mock.restoreAll()
  })

  test('createDispute blocks if requester is not a party to the booking', async () => {
    mock.method(disputeService, 'createDispute', async () => {
      throw new ForbiddenError('Only the renter or owner can open a dispute for this booking.')
    })

    const req = createMockRequest({
      body: { bookingId: 'b-1', reason: 'OTHER', description: 'Test' },
      userId: 'not-involved',
    })

    let capturedError: any = null
    const next = (err?: any) => { capturedError = err }

    await createDispute(req as any, mockRes as any, next)

    assert.ok(capturedError)
    assert.strictEqual(capturedError.message, 'Only the renter or owner can open a dispute for this booking.')
    assert.strictEqual(capturedError.statusCode, 403)
  })

  test('validate(CreateDisputeSchema) rejects a description over 1000 characters', () => {
    const req: any = {
      body: {
        bookingId: '11111111-1111-4111-8111-111111111111',
        reason: 'OTHER',
        description: 'D'.repeat(1001),
      },
      params: {},
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(CreateDisputeSchema)(req, mockRes as any, next)

    assert.ok(capturedError, 'ZodError should be passed to next()')
    errorHandler(capturedError, req, mockRes as any, () => {})

    assert.strictEqual(mockRes.statusCode, 400)
    const paths = (mockRes.body as any).issues.map((i: any) => i.path)
    assert.ok(paths.includes('body.description'), 'should flag description over 1000 characters')
  })

  test('validate(CreateDisputeSchema) accepts a description within bounds', () => {
    const req: any = {
      body: {
        bookingId: '11111111-1111-4111-8111-111111111111',
        reason: 'OTHER',
        description: 'A perfectly reasonable dispute description.',
      },
      params: {},
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(CreateDisputeSchema)(req, mockRes as any, next)

    assert.ok(!capturedError, 'should not raise a ZodError')
  })
})
