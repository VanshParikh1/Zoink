import { test, describe, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import { requireAdmin } from '../../middleware/requireAdmin'
import { createMockRequest, createMockResponse } from '../../testUtils/httpMocks'
import * as paymentService from '../../services/paymentService'
import * as disputeService from '../../services/disputeService'
import prisma from '../../utils/prisma'
import { InternalServerError } from '../../utils/errors'

describe('Admin and Dispute Tests', () => {
  let mockRes: any

  beforeEach(() => {
    mockRes = createMockResponse()
    mock.restoreAll()
  })

  test('requireAdmin blocks non-admin users with 403', () => {
    const req = createMockRequest({ role: 'USER' })
    let error: any = null
    const next = (err?: any) => { error = err }

    requireAdmin(req as any, mockRes as any, next)

    assert.ok(error)
    assert.strictEqual(error.statusCode, 403)
    assert.strictEqual(error.message, 'Admin access required.')
  })

  test('requireAdmin allows admin users', () => {
    const req = createMockRequest({ role: 'ADMIN' })
    let error: any = null
    let nextCalled = false
    const next = (err?: any) => { 
      error = err
      nextCalled = true
    }

    requireAdmin(req as any, mockRes as any, next)

    assert.strictEqual(error, undefined)
    assert.ok(nextCalled)
  })

  test('resolveDispute triggers refund and rolls back on Stripe failure', async () => {
    // Mock Prisma behavior to ensure it doesn't actually hit the DB
    const mockDispute = { id: 'd-1', status: 'OPEN', bookingId: 'b-1', booking: { id: 'b-1', totalPrice: 100 } }
    mock.method(prisma.dispute, 'findUnique', async () => mockDispute)
    
    let transactionCalled = false
    mock.method(prisma, '$transaction', async () => {
      transactionCalled = true
    })

    // Mock Stripe refund to fail
    mock.method(paymentService, 'refundPaymentIntent', async () => {
      throw new Error('Stripe network error')
    })

    try {
      await disputeService.resolveDispute('d-1', 'admin-1', 'RESOLVED_REFUND', 'Refunded')
      assert.fail('Expected error to be thrown')
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 500)
      assert.ok(err.message.includes('Failed to refund payment via Stripe: Stripe network error'))
    }

    // Ensure transaction (DB update) was never called
    assert.strictEqual(transactionCalled, false)
  })
})
