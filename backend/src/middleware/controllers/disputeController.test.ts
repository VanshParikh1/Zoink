import { test, describe, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import { createDispute, toDisputeResponse } from './disputeController'
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

// Response shaping for the user-facing dispute reads (getDispute / getMyDisputes).
// The raw Prisma row leaked internal adjudication data (resolvedByAdminId, the
// counterparty's free-text description) and every booking scalar column to a
// non-admin participant — the controller now projects with toDisputeResponse().
describe('disputeController — toDisputeResponse projection', () => {
  const RAISER_ID = 'renter-1'
  const OTHER_PARTY_ID = 'owner-1'

  // A raw dispute row in the shape selected by the controller's `disputeSelect`.
  const fakeRow = () => ({
    id: 'dispute-1',
    bookingId: 'booking-1',
    raisedByUserId: RAISER_ID,
    reason: 'ITEM_DAMAGED' as any,
    description: 'Raiser private free-text describing the damage.',
    status: 'RESOLVED_REFUND' as any,
    resolutionNotes: 'Admin decided a partial refund was warranted.',
    resolvedByAdminId: 'admin-99',
    refundAmountCents: 1500,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    resolvedAt: new Date('2026-01-02T00:00:00.000Z'),
    booking: {
      id: 'booking-1',
      status: 'COMPLETED' as any,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-03T00:00:00.000Z'),
      renterId: RAISER_ID,
      ownerId: OTHER_PARTY_ID,
      listing: { title: 'Canon 5D Mark IV' },
    },
  })

  test('the party the dispute was raised against gets no internal fields and no counterparty description', () => {
    const body = toDisputeResponse(fakeRow(), OTHER_PARTY_ID, 'USER') as any

    assert.strictEqual(body.id, 'dispute-1')
    assert.strictEqual(body.status, 'RESOLVED_REFUND')
    // Outcome fields the app already shows to participants stay.
    assert.strictEqual(body.resolutionNotes, 'Admin decided a partial refund was warranted.')
    assert.strictEqual(body.refundAmountCents, 1500)
    // Internal / counterparty fields are withheld.
    assert.ok(!('resolvedByAdminId' in body), 'resolvedByAdminId must not be exposed to a non-admin')
    assert.ok(!('description' in body), 'the raiser\'s free-text description must not reach the other party')
    // Booking relation is a narrow projection, not the raw row.
    assert.deepStrictEqual(Object.keys(body.booking).sort(), ['endDate', 'id', 'listing', 'startDate', 'status'])
    assert.strictEqual(body.booking.listing.title, 'Canon 5D Mark IV')
    assert.ok(!('renterId' in body.booking) && !('ownerId' in body.booking), 'booking ids are for the auth check only')
  })

  test('the raiser sees their own description but still no resolvedByAdminId', () => {
    const body = toDisputeResponse(fakeRow(), RAISER_ID, 'USER') as any

    assert.strictEqual(body.description, 'Raiser private free-text describing the damage.')
    assert.strictEqual(body.resolutionNotes, 'Admin decided a partial refund was warranted.')
    assert.ok(!('resolvedByAdminId' in body), 'resolvedByAdminId must not be exposed to a non-admin')
  })

  test('an ADMIN caller keeps the full adjudication shape', () => {
    const body = toDisputeResponse(fakeRow(), 'admin-1', 'ADMIN') as any

    assert.strictEqual(body.description, 'Raiser private free-text describing the damage.')
    assert.strictEqual(body.resolvedByAdminId, 'admin-99')
  })
})
