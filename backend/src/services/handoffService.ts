import { BookingEventType, BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors'
import { bookingSelect, createBookingEvent, createReviewObligationsForCompletedBooking, toBookingResponse } from './bookingService'
import { notifyUser } from './notificationService'
import { capturePaymentIntent } from './paymentService'

export type HandoffPhase = 'pickup' | 'return'
const CONFIRM_WINDOW_MS = Number(process.env.ZOINK_TAP_WINDOW_MS ?? 5 * 60 * 1000)

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

function sanitizePhotoUrls(photoUrls: unknown) {
  if (!Array.isArray(photoUrls)) {
    throw new BadRequestError('photos must contain 2 to 3 Cloudinary URLs.')
  }

  const sanitized = photoUrls.map((url) => String(url).trim()).filter(Boolean)
  if (sanitized.length < 2 || sanitized.length > 3) {
    throw new BadRequestError('photos must contain 2 to 3 Cloudinary URLs.')
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
  const photos = sanitizePhotoUrls(photoUrls)
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

  const updated: any = await prisma.$transaction(async (tx) => {
    const data: Prisma.BookingUpdateManyMutationInput = {
      [actorField]: now,
      version: { increment: 1 },
    } as any

    if (shouldCapture) {
      data.status = BookingStatus.ACTIVE
      data.startDate = now
      data.paymentStatus = PaymentStatus.CAPTURE_PENDING
    }

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

    if (shouldCapture || shouldComplete) {
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
        from: booking.status,
        to: completedStatus(phase),
      })
    }

    if (shouldComplete) {
      const completed = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { id: true, renterId: true, ownerId: true },
      })
      await createReviewObligationsForCompletedBooking(tx, completed)
    }

    return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: bookingSelect as any })
  })

  if (shouldCapture) {
    try {
      await capturePaymentIntent(updated)
    } catch (error) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: PaymentStatus.FAILED },
      })
      await prisma.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorId,
          type: BookingEventType.ERROR,
          metadata: {
            action: 'capture_payment',
            message: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
          },
        },
      })
    }
  }

  return { bothConfirmed, booking: toBookingResponse(updated, actorId) }
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

export async function registerTap(bookingId: string, actorId: string, phase: HandoffPhase) {
  const result = await confirmHandoff(bookingId, actorId, phase)
  return result.booking
}
