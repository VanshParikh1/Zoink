import { BookingEventType, DisputeReason, DisputeStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, ForbiddenError, InternalServerError, NotFoundError } from '../utils/errors'
import { refundPaymentIntent, toCents } from './paymentService'

export async function createDispute(bookingId: string, requesterId: string, reason: DisputeReason, description: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new NotFoundError('Booking not found')

  if (booking.renterId !== requesterId && booking.ownerId !== requesterId) {
    throw new ForbiddenError('Only the renter or owner can open a dispute for this booking.')
  }

  // Check if a dispute already exists for this booking
  const existing = await prisma.dispute.findFirst({
    where: { bookingId, status: { notIn: ['RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED'] } }
  })

  if (existing) {
    throw new BadRequestError('An open dispute already exists for this booking.')
  }

  const dispute = await prisma.dispute.create({
    data: {
      bookingId,
      raisedByUserId: requesterId,
      reason,
      description,
      status: 'OPEN',
    },
  })

  await prisma.bookingEvent.create({
    data: {
      bookingId,
      actorId: requesterId,
      type: BookingEventType.DISPUTE_OPENED,
      metadata: { disputeId: dispute.id, reason },
    }
  })

  await prisma.booking.update({
    where: { id: bookingId },
    data: { disputeStatus: 'OPEN' }
  })

  return dispute
}

export async function resolveDispute(disputeId: string, adminId: string, status: DisputeStatus, resolutionNotes: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { booking: true }
  })

  if (!dispute) throw new NotFoundError('Dispute not found')
  if (dispute.status === 'RESOLVED_REFUND' || dispute.status === 'RESOLVED_NO_ACTION' || dispute.status === 'DISMISSED') {
    throw new BadRequestError('Dispute is already resolved.')
  }

  // DEFERRED SCOPE: Any logic touching the uncaptured deposit authorization 
  // (e.g., capturing part of it for ITEM_DAMAGED) is explicitly out of scope for Phase 6.
  // Currently, ITEM_DAMAGED disputes should only resolve as RESOLVED_NO_ACTION or DISMISSED,
  // or RESOLVED_REFUND (which refunds the captured rental fee, not the deposit).

  if (status === 'RESOLVED_REFUND') {
    // Refund the captured rental fee (totalPrice)
    try {
      await refundPaymentIntent(dispute.booking, toCents(dispute.booking.totalPrice))
    } catch (err: any) {
      // If Stripe refund fails, we throw to abort the DB transaction/update
      throw new InternalServerError(`Failed to refund payment via Stripe: ${err.message}`)
    }
  }

  // Update dispute and booking
  const updatedDispute = await prisma.$transaction(async (tx) => {
    const res = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status,
        resolutionNotes,
        resolvedByAdminId: adminId,
        resolvedAt: new Date(),
      }
    })

    await tx.booking.update({
      where: { id: dispute.bookingId },
      data: { disputeStatus: status }
    })

    await tx.bookingEvent.create({
      data: {
        bookingId: dispute.bookingId,
        actorId: adminId,
        type: BookingEventType.DISPUTE_RESOLVED,
        metadata: { disputeId, status, resolutionNotes }
      }
    })

    return res
  })

  return updatedDispute
}
