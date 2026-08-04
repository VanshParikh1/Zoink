import { test, describe, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import { requireAdmin } from '../../middleware/requireAdmin'
import { createMockRequest, createMockResponse } from '../../testUtils/httpMocks'
import * as paymentService from '../../services/paymentService'
import * as disputeService from '../../services/disputeService'
import * as bookingEventService from '../../services/bookingEventService'
import prisma from '../../utils/prisma'
import { InternalServerError } from '../../utils/errors'
import { validate } from '../../middleware/validate'
import { ResolveDisputeSchema } from '../../schemas/dispute.schema'
import { errorHandler } from '../errorHandler'

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
    const mockDispute = { id: 'd-1', status: 'OPEN', bookingId: 'b-1', booking: { id: 'b-1', totalPrice: 100 } }

    const mockDb: any = {
      dispute: { findUnique: async () => mockDispute },
      $transaction: async () => { transactionCalled = true },
    }
    let transactionCalled = false

    mock.method(paymentService, 'refundPaymentIntent', async () => {
      throw new Error('Stripe network error')
    })

    try {
      await disputeService.resolveDispute('d-1', 'admin-1', 'RESOLVED_REFUND', 'Refunded', undefined, mockDb)
      assert.fail('Expected error to be thrown')
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 500)
      assert.ok(err.message.includes('Failed to refund payment via Stripe: Stripe network error'))
    }

    assert.strictEqual(transactionCalled, false)
  })

  test('validate(ResolveDisputeSchema) rejects resolutionNotes over 1000 characters', () => {
    const req: any = {
      body: { status: 'RESOLVED_NO_ACTION', resolutionNotes: 'N'.repeat(1001) },
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(ResolveDisputeSchema)(req, mockRes as any, next)

    assert.ok(capturedError, 'ZodError should be passed to next()')
    errorHandler(capturedError, req, mockRes as any, () => {})

    assert.strictEqual(mockRes.statusCode, 400)
    const paths = (mockRes.body as any).issues.map((i: any) => i.path)
    assert.ok(paths.includes('body.resolutionNotes'), 'should flag resolutionNotes over 1000 characters')
  })

  test('validate(ResolveDisputeSchema) accepts resolutionNotes within bounds', () => {
    const req: any = {
      body: { status: 'RESOLVED_NO_ACTION', resolutionNotes: 'Reviewed evidence, no action needed.' },
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(ResolveDisputeSchema)(req, mockRes as any, next)

    assert.ok(!capturedError, 'should not raise a ZodError')
  })

  test('getBookingEvents returns the booking event history in chronological order', async () => {
    const mockEvents = [
      { id: 'e-1', bookingId: 'b-1', actorId: 'admin-1', type: 'DISPUTE_OPENED', metadata: null, createdAt: new Date('2026-01-01') },
      { id: 'e-2', bookingId: 'b-1', actorId: 'admin-1', type: 'DISPUTE_RESOLVED', metadata: null, createdAt: new Date('2026-01-02') },
    ]
    let findManyArgs: any = null

    const mockDb: any = {
      booking: { findUnique: async () => ({ id: 'b-1' }) },
      bookingEvent: {
        findMany: async (args: any) => {
          findManyArgs = args
          return mockEvents
        },
      },
    }

    const events = await bookingEventService.getBookingEvents('b-1', mockDb)

    assert.deepStrictEqual(events, mockEvents)
    assert.strictEqual(findManyArgs.where.bookingId, 'b-1')
    assert.deepStrictEqual(findManyArgs.orderBy, { createdAt: 'asc' })
  })

  test('getBookingEvents throws NotFoundError when the booking does not exist', async () => {
    const mockDb: any = {
      booking: { findUnique: async () => null },
      bookingEvent: { findMany: async () => [] },
    }

    try {
      await bookingEventService.getBookingEvents('missing-booking', mockDb)
      assert.fail('Expected NotFoundError to be thrown')
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 404)
      assert.strictEqual(err.message, 'Booking not found')
    }
  })
})
