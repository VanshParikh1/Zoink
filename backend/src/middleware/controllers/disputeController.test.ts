import { test, describe, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import { createDispute } from './disputeController'
import { createMockRequest, createMockResponse } from '../../testUtils/httpMocks'
import * as disputeService from '../../services/disputeService'
import { ForbiddenError } from '../../utils/errors'

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
})
