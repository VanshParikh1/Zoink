import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as bookingService from '../../services/bookingService'
import {
  acceptBooking,
  createBooking,
} from './bookingController'
import { validate } from '../validate'
import { CreateBookingSchema } from '../../schemas/booking.schema'
import { createMockResponse } from '../../testUtils/httpMocks'
import { ConflictError } from '../../utils/errors'
import { errorHandler } from '../errorHandler'

const originalCreateBooking = bookingService.createBooking
const originalTransitionBookingStatus = bookingService.transitionBookingStatus

afterEach(() => {
  ;(bookingService as any).createBooking = originalCreateBooking
  ;(bookingService as any).transitionBookingStatus = originalTransitionBookingStatus
})

test('validate(CreateBookingSchema) passes ZodError to next when required fields are missing', async () => {
  // Simulate the middleware pipeline: validate() runs first, then createBooking.
  // With endDate missing, validate() calls next(zodError) — createBooking is never reached.
  const req: any = {
    userId: 'renter-1',
    body: { listingId: 'listing-1', startDate: '2026-05-01T00:00:00.000Z' },
    params: {},
    query: {},
  }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  const middleware = validate(CreateBookingSchema)
  middleware(req, res as any, next)

  // Captured error should be a ZodError — pass it to errorHandler
  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  assert.equal((res.body as any).error, 'Validation failed.')
  assert.ok(Array.isArray((res.body as any).issues), 'issues array should be present')
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.endDate'), 'should flag missing endDate')
})

test('createBooking returns 201 with booking payload from service', async () => {
  const booking = { id: 'booking-1', status: 'PENDING' }
  ;(bookingService as any).createBooking = async (userId: string, input: any) => {
    assert.equal(userId, 'renter-1')
    assert.equal(input.listingId, 'listing-1')
    assert.ok(input.startDate instanceof Date)
    assert.ok(input.endDate instanceof Date)
    return booking
  }

  const req: any = {
    userId: 'renter-1',
    body: {
      listingId: 'listing-1',
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-03T00:00:00.000Z',
      message: 'Can I pick it up early?',
    },
  }
  const res = createMockResponse()
  const next = (err: any) => {}

  await createBooking(req, res as any, next)

  assert.equal(res.statusCode, 201)
  assert.equal(res.body, booking)
})

test('acceptBooking maps overlap errors to 409', async () => {
  ;(bookingService as any).transitionBookingStatus = async () => {
    throw new ConflictError('Those dates overlap with another accepted booking.')
  }

  const req: any = {
    userId: 'owner-1',
    params: { id: 'booking-1' },
  }
  const res = createMockResponse()
  let nextCalledWith: any = null
  const next = (err: any) => { nextCalledWith = err }

  await acceptBooking(req, res as any, next)

  if (nextCalledWith) {
    errorHandler(nextCalledWith, req, res as any, () => {})
  }

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, {
    error: 'Those dates overlap with another accepted booking.',
  })
})
