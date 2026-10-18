import { BookingEventType, BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors'
import { bookingSelect, createBookingEvent, createReviewObligationsForCompletedBooking, toBookingResponse, withBookingLock } from './bookingService'
import { notifyUser } from './notificationService'
import { capturePaymentIntent, retrievePaymentIntent } from './paymentService'
import { ZOINK_TAP_WINDOW_MS } from '../config/bookingWindows'
import { Sentry } from '../instrument'

export type HandoffPhase = 'pickup' | 'return'

/** The rent couldn't be captured when both parties tapped at pickup, so the
 *  pickup didn't happen: the booking stays PICKUP_PENDING. Shown on both
 *  phones. */
export class PickupPaymentFailedError extends ConflictError {
  readonly code = 'PICKUP_PAYMENT_FAILED'
  constructor() {
    super("The rental payment couldn't be collected, so the pickup didn't go through. Keep the item for now and try Zoink It again. If it keeps failing, contact support.")
  }
}
// The same window the stale-tap cleanup and the app's countdown use. No env
// override: it's a contract term (see config/bookingWindows.ts).
const CONFIRM_WINDOW_MS = ZOINK_TAP_WINDOW_MS

function isWithinConfirmWindow(left?: Date | null, right?: Date | null) {
  if (!left || !right) return false
  return Math.abs(left.getTime() - right.getTime()) <= CONFIRM_WINDOW_MS
}

function tapFields(phase: HandoffPhase, isOwner: boolean) {
  if (phase === 'pickup') {
    return {
      actorField: isOwner ? 'ownerPickupTappedAt' : 'renterPickupTappedAt',
      otherField: isOwner ? 'renterPickupTappedAt' : 'ownerPickupTappedAt',
    } as const
  }

  return {
    actorField: isOwner ? 'ownerReturnTappedAt' : 'renterReturnTappedAt',
    otherField: isOwner ? 'renterReturnTappedAt' : 'ownerReturnTappedAt',
  } as const
}

function photoField(phase: HandoffPhase) {
  return phase === 'pickup' ? 'pickupPhotos' : 'returnPhotos'
}

function initiatedField(phase: HandoffPhase) {
  return phase === 'pickup' ? 'handoffInitiatedAt' : 'returnInitiatedAt'
}

function pendingStatus(phase: HandoffPhase) {
  return phase === 'pickup' ? BookingStatus.PICKUP_PENDING : BookingStatus.RETURN_PENDING
}

function completedStatus(phase: HandoffPhase) {
  return phase === 'pickup' ? BookingStatus.ACTIVE : BookingStatus.COMPLETED
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Handoff evidence must be what POST /bookings/:id/photos/upload stored for
// THIS booking: https://res.cloudinary.com/<our cloud>/image/upload/[...]/
// bookings/booking_<bookingId>_<suffix>. Anything else — another host, another
// booking's upload, another Cloudinary account — would let one party point the
// other's app at an arbitrary image or tracking URL.
function isOwnHandoffUpload(url: string, bookingId: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  if (!cloudName) return false

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || parsed.search || parsed.hash) {
    return false
  }

  const path = new RegExp(
    `^/${escapeRegExp(cloudName)}/image/upload/(?:[^/]+/)*bookings/booking_${escapeRegExp(bookingId)}_[^/]+$`
  )
  return path.test(parsed.pathname)
}

function sanitizePhotoUrls(photoUrls: unknown, bookingId: string) {
  if (!Array.isArray(photoUrls)) {
    throw new BadRequestError('photos must contain 2 to 3 Cloudinary URLs.')
  }

  const sanitized = photoUrls.map((url) => String(url).trim()).filter(Boolean)
  if (sanitized.length < 2 || sanitized.length > 3) {
    throw new BadRequestError('photos must contain 2 to 3 Cloudinary URLs.')
  }

  if (!sanitized.every((url) => isOwnHandoffUpload(url, bookingId))) {
    throw new BadRequestError('Handoff photos must be taken and uploaded in the Zoink app.')
  }

  return sanitized
}

async function getBooking(bookingId: string) {
  const booking: any = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) throw new NotFoundError('Booking not found.')
  return booking
}

function assertParticipant(booking: any, actorId: string) {
  if (booking.ownerId !== actorId && booking.renterId !== actorId) {
    throw new ForbiddenError('You do not have access to this booking.')
  }
}

export async function initiateHandoff(bookingId: string, actorId: string, phase: HandoffPhase, photoUrls: unknown) {
  const photos = sanitizePhotoUrls(photoUrls, bookingId)
  const booking = await getBooking(bookingId)
  assertParticipant(booking, actorId)

  const isOwner = booking.ownerId === actorId
  const isRenter = booking.renterId === actorId
  const startStatus = phase === 'pickup' ? BookingStatus.CONFIRMED : BookingStatus.ACTIVE

  if (phase === 'pickup' && !isOwner) throw new ForbiddenError('Only the booking owner can initiate pickup.')
  if (phase === 'return' && !isRenter) throw new ForbiddenError('Only the booking renter can initiate return.')

  // First submission moves the booking into the pending phase and notifies the
  // other party. Once already pending, the same person can resubmit photos
  // (e.g. to fix a bad shot) without re-triggering those one-time side effects —
  // taps, if any were already registered, are intentionally left alone.
  const isFirstSubmission = booking.status === startStatus
  const isPhotoEdit = booking.status === pendingStatus(phase)
  if (!isFirstSubmission && !isPhotoEdit) {
    throw new BadRequestError('That booking transition is not allowed.')
  }

  const now = new Date()
  const updated: any = await prisma.$transaction(async (tx) => {
    const data: any = {
      [photoField(phase)]: photos,
      version: { increment: 1 },
    }

    if (isFirstSubmission) {
      data[initiatedField(phase)] = now
      data.status = pendingStatus(phase)
    }

    const result = await tx.booking.updateMany({
      where: { id: booking.id, version: booking.version },
      data,
    })

    if (result.count !== 1) throw new ConflictError('This booking was updated by someone else. Please refresh and try again.')

    await createBookingEvent(tx, booking.id, actorId, BookingEventType.UPLOAD_PHOTOS, {
      phase,
      count: photos.length,
      edited: !isFirstSubmission,
    })

    if (isFirstSubmission) {
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
        from: booking.status,
        to: pendingStatus(phase),
      })
    }

    return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: bookingSelect as any })
  })

  if (isFirstSubmission) {
    const recipientId = phase === 'pickup' ? booking.renterId : booking.ownerId
    const body =
      phase === 'pickup'
        ? 'Owner has documented the item - time to Zoink It'
        : 'Renter has documented the return - time to Zoink It'

    void notifyUser({
      userId: recipientId,
      type: 'BOOKING_ACCEPTED',
      title: 'Time to Zoink It',
      body,
      data: { bookingId: booking.id, listingId: booking.listingId, phase },
    })
  }

  return toBookingResponse(updated, actorId)
}

export async function confirmHandoff(bookingId: string, actorId: string, phase: HandoffPhase) {
  const booking = await getBooking(bookingId)
  const isOwner = booking.ownerId === actorId
  const isRenter = booking.renterId === actorId

  if (!isOwner && !isRenter) throw new ForbiddenError('You do not have access to this booking.')
  if (booking.status !== pendingStatus(phase) && booking.status !== completedStatus(phase)) {
    throw new BadRequestError('That booking transition is not allowed.')
  }

  const photos = booking[photoField(phase)]
  if (!Array.isArray(photos) || photos.length < 2 || photos.length > 3) {
    throw new BadRequestError('Upload handoff photos before tapping Zoink It.')
  }

  if (booking.status === completedStatus(phase)) {
    return { bothConfirmed: true, booking: toBookingResponse(booking, actorId) }
  }

  const now = new Date()
  const { actorField, otherField } = tapFields(phase, isOwner)
  const otherTappedAt = booking[otherField] as Date | null
  const bothConfirmed = isWithinConfirmWindow(now, otherTappedAt)
  const shouldCapture = phase === 'pickup' && bothConfirmed
  const shouldComplete = phase === 'return' && bothConfirmed

  if (shouldCapture) {
    return completePickup(booking, actorId, actorField)
  }

  const updated: any = await prisma.$transaction(async (tx) => {
    const data: Prisma.BookingUpdateManyMutationInput = {
      [actorField]: now,
      version: { increment: 1 },
    } as any

    if (shouldComplete) {
      data.status = BookingStatus.COMPLETED
      data.endDate = now
      data.completedAt = now
      data.paymentStatus = booking.paymentStatus === PaymentStatus.CAPTURED ? PaymentStatus.PAYOUT_PENDING : booking.paymentStatus
    }

    const result = await tx.booking.updateMany({
      where: { id: booking.id, version: booking.version },
      data,
    })

    if (result.count !== 1) throw new ConflictError('This booking was updated by someone else. Please refresh and try again.')

    await createBookingEvent(tx, booking.id, actorId, BookingEventType.ZOINK_TAP, {
      phase,
      synchronized: bothConfirmed,
      actorField,
    })

    if (shouldComplete) {
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
        from: booking.status,
        to: completedStatus(phase),
      })
      const completed = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { id: true, renterId: true, ownerId: true },
      })
      await createReviewObligationsForCompletedBooking(tx, completed)
    }

    return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: bookingSelect as any })
  })

  return { bothConfirmed, booking: toBookingResponse(updated, actorId) }
}

/** Captures the rent, treating "Stripe already captured it" (a retry after a
 *  lost response) as success. */
async function captureRent(booking: any) {
  try {
    await capturePaymentIntent(booking)
  } catch (error) {
    const intent = await retrievePaymentIntent(booking.stripePaymentIntentId).catch(() => null)
    if (intent?.status === 'succeeded') return
    throw error
  }
}

// Pickup is where the rent is charged, so the booking only goes ACTIVE once
// the capture has succeeded: under the booking's row lock, capture, then write
// the tap and ACTIVE in the same transaction. A concurrent tap waits for the
// lock and then gets the usual 409. If Stripe refuses, nothing about the
// handoff is written (still PICKUP_PENDING, taps as they were, paymentStatus
// untouched since the authorization's real state comes from Stripe's
// webhooks); the failure is recorded on the booking, reported to Sentry for
// follow-up, and both people are told to keep the item. The booking version is
// bumped so the next tap tries a fresh capture: Stripe replays a failed
// response for an idempotency key it has already seen.
async function completePickup(booking: any, actorId: string, actorField: string) {
  let captureError: unknown
  try {
    const updated: any = await withBookingLock(booking.id, async (tx) => {
      const current = await tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { version: true } })
      if (current.version !== booking.version) {
        throw new ConflictError('This booking was updated by someone else. Please refresh and try again.')
      }

      try {
        await captureRent(booking)
      } catch (error) {
        captureError = error
        throw error
      }

      const now = new Date()
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          [actorField]: now,
          status: BookingStatus.ACTIVE,
          startDate: now,
          paymentStatus: PaymentStatus.CAPTURE_PENDING,
          version: { increment: 1 },
        },
      })
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.ZOINK_TAP, {
        phase: 'pickup',
        synchronized: true,
        actorField,
      })
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
        from: booking.status,
        to: BookingStatus.ACTIVE,
      })
      return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: bookingSelect as any })
    })
    return { bothConfirmed: true, booking: toBookingResponse(updated, actorId) }
  } catch (error) {
    if (captureError === undefined) throw error
    await recordPickupCaptureFailure(booking.id, actorId, captureError)
    throw new PickupPaymentFailedError()
  }
}

async function recordPickupCaptureFailure(bookingId: string, actorId: string, error: unknown) {
  console.error(`[capture_payment] pickup capture failed for booking ${bookingId}:`, error)
  Sentry.captureException(error, { tags: { action: 'capture_payment', bookingId } })
  try {
    await prisma.$transaction([
      prisma.booking.update({ where: { id: bookingId }, data: { version: { increment: 1 } } }),
      prisma.bookingEvent.create({
        data: {
          bookingId,
          actorId,
          type: BookingEventType.ERROR,
          metadata: {
            action: 'capture_payment',
            message: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
            blockedHandoff: true,
          },
        },
      }),
    ])
  } catch (auditError) {
    console.error(`[capture_payment] could not record the failure for booking ${bookingId}:`, auditError)
  }
}

export async function getCompletedHandoffPhotos(bookingId: string, actorId: string) {
  const booking = await getBooking(bookingId)
  assertParticipant(booking, actorId)

  if (booking.status !== BookingStatus.COMPLETED) {
    throw new ForbiddenError('Photos are only available after the rental is completed')
  }

  return {
    pickupPhotos: Array.isArray(booking.pickupPhotos) ? booking.pickupPhotos : [],
    returnPhotos: Array.isArray(booking.returnPhotos) ? booking.returnPhotos : [],
  }
}

export async function uploadHandoffPhotos(bookingId: string, actorId: string, phase: HandoffPhase, photoUrls: string[]) {
  return initiateHandoff(bookingId, actorId, phase, photoUrls)
}

/**
 * Authorization gate for the raw photo-file upload route
 * (POST /bookings/:id/photos/upload). Unlike initiateHandoff/uploadHandoffPhotos,
 * that endpoint streams the file straight to Cloudinary from the controller and
 * never enters this service, so it needs the same booking-participant check that
 * every other handoff operation performs — 404 for an unknown booking, 403 for a
 * caller who is neither the renter nor the owner.
 */
export async function assertHandoffParticipant(bookingId: string, actorId: string) {
  const booking = await getBooking(bookingId)
  assertParticipant(booking, actorId)
}

export async function registerTap(bookingId: string, actorId: string, phase: HandoffPhase) {
  const result = await confirmHandoff(bookingId, actorId, phase)
  return result.booking
}
