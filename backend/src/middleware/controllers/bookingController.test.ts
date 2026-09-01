import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as bookingService from '../../services/bookingService'
import * as handoffService from '../../services/handoffService'
import * as cloudinary from '../../utils/cloudinary'
import {
  acceptBooking,
  createBooking,
  uploadHandoffPhotoImage,
} from './bookingController'
import { validate } from '../validate'
import { CreateBookingSchema } from '../../schemas/booking.schema'
import { createMockResponse } from '../../testUtils/httpMocks'
import { ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors'
import { errorHandler } from '../errorHandler'

const originalCreateBooking = bookingService.createBooking
const originalTransitionBookingStatus = bookingService.transitionBookingStatus
const originalAssertHandoffParticipant = handoffService.assertHandoffParticipant
const originalUploadImage = cloudinary.uploadImage

afterEach(() => {
  ;(bookingService as any).createBooking = originalCreateBooking
  ;(bookingService as any).transitionBookingStatus = originalTransitionBookingStatus
  ;(handoffService as any).assertHandoffParticipant = originalAssertHandoffParticipant
  ;(cloudinary as any).uploadImage = originalUploadImage
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

test('validate(CreateBookingSchema) rejects a message over 500 characters', () => {
  const req: any = {
    userId: 'renter-1',
    body: {
      listingId: 'listing-1',
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-03T00:00:00.000Z',
      message: 'M'.repeat(501),
    },
    params: {},
    query: {},
  }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(CreateBookingSchema)(req, res as any, next)

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.message'), 'should flag message over 500 characters')
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

// ── POST /bookings/:id/photos/upload — authorization gate ─────────────────────
// This route streams straight to Cloudinary and used to do NO booking lookup,
// so any verified user could upload against any booking id. It must now reject
// non-participants (403) and unknown bookings (404) BEFORE the file check and
// BEFORE any Cloudinary call.

test('uploadHandoffPhotoImage rejects a non-participant with 403 and never calls Cloudinary', async () => {
  let uploadCalled = false
  ;(cloudinary as any).uploadImage = async () => {
    uploadCalled = true
    return 'https://res.cloudinary.com/demo/image/upload/bookings/x.jpg'
  }
  ;(handoffService as any).assertHandoffParticipant = async (bookingId: string, actorId: string) => {
    assert.equal(bookingId, 'booking-1')
    assert.equal(actorId, 'stranger-1')
    throw new ForbiddenError('You do not have access to this booking.')
  }

  const req: any = {
    userId: 'stranger-1',
    params: { id: 'booking-1' },
    // A file IS present — proves authorization runs first, not the file check.
    file: { buffer: Buffer.from('fake-image-bytes') },
  }
  const res = createMockResponse()
  let nextErr: any = null
  await uploadHandoffPhotoImage(req, res as any, (err: any) => { nextErr = err })
  if (nextErr) errorHandler(nextErr, req, res as any, () => {})

  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, { error: 'You do not have access to this booking.' })
  assert.equal(uploadCalled, false, 'Cloudinary upload must not be reached for a non-participant')
})

test('uploadHandoffPhotoImage surfaces an unknown booking as 404 before any upload', async () => {
  let uploadCalled = false
  ;(cloudinary as any).uploadImage = async () => { uploadCalled = true; return 'x' }
  ;(handoffService as any).assertHandoffParticipant = async () => {
    throw new NotFoundError('Booking not found.')
  }

  const req: any = {
    userId: 'user-1',
    params: { id: 'does-not-exist' },
    file: { buffer: Buffer.from('fake-image-bytes') },
  }
  const res = createMockResponse()
  let nextErr: any = null
  await uploadHandoffPhotoImage(req, res as any, (err: any) => { nextErr = err })
  if (nextErr) errorHandler(nextErr, req, res as any, () => {})

  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.body, { error: 'Booking not found.' })
  assert.equal(uploadCalled, false)
})

test('uploadHandoffPhotoImage still 400s on a missing file — but only after authorization passes', async () => {
  let authChecked = false
  ;(handoffService as any).assertHandoffParticipant = async () => { authChecked = true }
  ;(cloudinary as any).uploadImage = async () => { throw new Error('uploadImage must not be called') }

  const req: any = { userId: 'renter-1', params: { id: 'booking-1' } } // no .file
  const res = createMockResponse()
  await uploadHandoffPhotoImage(req, res as any, () => {})

  assert.equal(authChecked, true, 'authorization must run before the file check')
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'No image file provided.' })
})

test('uploadHandoffPhotoImage returns 201 with the Cloudinary URL for an authorized participant', async () => {
  ;(handoffService as any).assertHandoffParticipant = async () => { /* participant — allow */ }
  ;(cloudinary as any).uploadImage = async (buf: Buffer, folder: string, publicId: string) => {
    assert.ok(Buffer.isBuffer(buf))
    assert.equal(folder, 'bookings')
    assert.ok(publicId.startsWith('booking_booking-1_'), `unexpected publicId: ${publicId}`)
    return 'https://res.cloudinary.com/demo/image/upload/bookings/booking_booking-1_123.jpg'
  }

  const req: any = {
    userId: 'renter-1',
    params: { id: 'booking-1' },
    file: { buffer: Buffer.from('real-image-bytes') },
  }
  const res = createMockResponse()
  await uploadHandoffPhotoImage(req, res as any, () => {})

  assert.equal(res.statusCode, 201)
  assert.deepEqual(res.body, {
    url: 'https://res.cloudinary.com/demo/image/upload/bookings/booking_booking-1_123.jpg',
  })
})
