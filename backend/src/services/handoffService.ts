import { BookingEventType, BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { bookingSelect, createBookingEvent, createReviewObligationsForCompletedBooking } from './bookingService'
import { capturePaymentIntent } from './paymentService'

type HandoffPhase = 'pickup' | 'return'
const TAP_WINDOW_MS = Number(process.env.ZOINK_TAP_WINDOW_MS ?? 5000)

function isWithinTapWindow(left?: Date | null, right?: Date | null) {
  if (!left || !right) return false
  return Math.abs(left.getTime() - right.getTime()) <= TAP_WINDOW_MS
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

function toBookingResponse(booking: any) {
  return {
    ...booking,
    totalPrice: Number(booking.totalPrice),
    depositAmount: Number(booking.depositAmount),
    commissionAmount: Number(booking.commissionAmount),
    ownerPayout: Number(booking.ownerPayout),
    insuranceFee: Number(booking.insuranceFee),
  }
}

export async function uploadHandoffPhotos(bookingId: string, actorId: string, phase: HandoffPhase, photoUrls: string[]) {
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
    throw new Error('HANDOFF_PHOTOS_REQUIRED')
  }

  const booking: any = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) throw new Error('BOOKING_NOT_FOUND')
  if (booking.ownerId !== actorId && booking.renterId !== actorId) throw new Error('BOOKING_FORBIDDEN')
  if (phase === 'pickup' && booking.status !== BookingStatus.ACCEPTED) throw new Error('BOOKING_INVALID_TRANSITION')
  if (phase === 'return' && booking.status !== BookingStatus.ACTIVE) throw new Error('BOOKING_INVALID_TRANSITION')

  const field = photoField(phase)
  const existing = Array.isArray(booking[field]) ? booking[field] : []
  const sanitized = photoUrls.map((url) => String(url).trim()).filter(Boolean)

  const updated: any = await prisma.$transaction(async (tx) => {
    const result = await tx.booking.updateMany({
      where: { id: booking.id, version: booking.version },
      data: {
        [field]: [...existing, ...sanitized],
        version: { increment: 1 },
      } as any,
    })

    if (result.count !== 1) throw new Error('BOOKING_VERSION_CONFLICT')

    await createBookingEvent(tx, booking.id, actorId, BookingEventType.UPLOAD_PHOTOS, {
      phase,
      count: sanitized.length,
    })

    return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: bookingSelect as any })
  })

  return toBookingResponse(updated)
}

export async function registerTap(bookingId: string, actorId: string, phase: HandoffPhase) {
  const booking: any = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) throw new Error('BOOKING_NOT_FOUND')

  const isOwner = booking.ownerId === actorId
  const isRenter = booking.renterId === actorId
  if (!isOwner && !isRenter) throw new Error('BOOKING_FORBIDDEN')

  if (phase === 'pickup' && booking.status !== BookingStatus.ACCEPTED) throw new Error('BOOKING_INVALID_TRANSITION')
  if (phase === 'return' && booking.status !== BookingStatus.ACTIVE) throw new Error('BOOKING_INVALID_TRANSITION')

  const photos = booking[photoField(phase)]
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new Error('HANDOFF_PHOTOS_REQUIRED')
  }

  const now = new Date()
  const { actorField, otherField } = tapFields(phase, isOwner)
  const otherTappedAt = booking[otherField] as Date | null
  const isSynchronized = isWithinTapWindow(now, otherTappedAt)
  const shouldCapture = phase === 'pickup' && isSynchronized
  const shouldComplete = phase === 'return' && isSynchronized

  const updated: any = await prisma.$transaction(async (tx) => {
    const data: Prisma.BookingUpdateManyMutationInput = {
      [actorField]: now,
      version: { increment: 1 },
    } as any

    if (shouldCapture) {
      data.status = BookingStatus.ACTIVE
      data.paymentStatus = PaymentStatus.CAPTURE_PENDING
    }

    if (shouldComplete) {
      data.status = BookingStatus.COMPLETED
      data.completedAt = now
      data.paymentStatus = booking.paymentStatus === PaymentStatus.CAPTURED ? PaymentStatus.PAYOUT_PENDING : booking.paymentStatus
    }

    const result = await tx.booking.updateMany({
      where: { id: booking.id, version: booking.version },
      data,
    })

    if (result.count !== 1) throw new Error('BOOKING_VERSION_CONFLICT')

    await createBookingEvent(tx, booking.id, actorId, BookingEventType.ZOINK_TAP, {
      phase,
      synchronized: isSynchronized,
      actorField,
    })

    if (shouldCapture) {
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
        from: booking.status,
        to: BookingStatus.ACTIVE,
      })
    }

    if (shouldComplete) {
      const completed = await tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: { id: true, renterId: true, ownerId: true },
      })
      await createReviewObligationsForCompletedBooking(tx, completed)
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
        from: booking.status,
        to: BookingStatus.COMPLETED,
      })
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

  return toBookingResponse(updated)
}
