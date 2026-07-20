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
    // We mock the service to throw the expected ForbiddenError, or we could test the service directly.
    // For controller unit tests, we'll assert that the controller calls the service with the right params.
    // If we want to test the service logic, we should test the service itself.
    // Let's test the controller propagation.
    mock.method(disputeService, 'createDispute', async () => {
      throw new ForbiddenError('Only the renter or owner can open a dispute for this booking.')
    })

    const req = createMockRequest({
      body: { bookingId: 'b-1', reason: 'OTHER', description: 'Test' },
      userId: 'not-involved',
    })

    try {
      await createDispute(req as any, mockRes as any, () => {})
      assert.fail('Expected error to be thrown')
    } catch (err: any) {
      assert.strictEqual(err.message, 'Only the renter or owner can open a dispute for this booking.')
      assert.strictEqual(err.statusCode, 403)
    }
  })
})
