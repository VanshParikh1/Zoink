import { BookingEventType, DisputeReason, DisputeStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, ForbiddenError, InternalServerError, NotFoundError } from '../utils/errors'
import { refundPaymentIntent, toCents } from './paymentService'

export async function createDispute(
  bookingId: string,
  requesterId: string,
  reason: DisputeReason,
  description: string,
  db: typeof prisma = prisma
) {
  const booking = await db.booking.findUnique({ where: { id: bookingId } })
  if (!booking) throw new NotFoundError('Booking not found')

  if (booking.renterId !== requesterId && booking.ownerId !== requesterId) {
    throw new ForbiddenError('Only the renter or owner can open a dispute for this booking.')
  }

  const existing = await db.dispute.findFirst({
    where: { bookingId, status: { notIn: ['RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED'] } }
  })

  if (existing) {
    throw new BadRequestError('An open dispute already exists for this booking.')
  }

  const dispute = await db.dispute.create({
    data: {
      bookingId,
      raisedByUserId: requesterId,
      reason,
      description,
      status: 'OPEN',
    },
  })

  await db.bookingEvent.create({
    data: {
      bookingId,
      actorId: requesterId,
      type: BookingEventType.DISPUTE_OPENED,
      metadata: { disputeId: dispute.id, reason },
    }
  })

  await db.booking.update({
    where: { id: bookingId },
    data: { disputeStatus: 'OPEN' }
  })

  return dispute
}

export async function resolveDispute(
  disputeId: string,
  adminId: string,
  status: DisputeStatus,
  resolutionNotes: string,
  refundAmountCents?: number,
  db: typeof prisma = prisma
) {
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: { booking: true }
  })

  if (!dispute) throw new NotFoundError('Dispute not found')
  if (dispute.status === 'RESOLVED_REFUND' || dispute.status === 'RESOLVED_NO_ACTION' || dispute.status === 'DISMISSED') {
    throw new BadRequestError('Dispute is already resolved.')
  }

  let refundedCents: number | undefined
  if (status === 'RESOLVED_REFUND') {
    const fullAmountCents = toCents(dispute.booking.totalPrice)
    refundedCents = refundAmountCents ?? fullAmountCents

    if (refundAmountCents !== undefined && refundAmountCents > fullAmountCents) {
      throw new BadRequestError('refundAmountCents cannot exceed the booking totalPrice.')
    }

    try {
      await refundPaymentIntent(dispute.booking, refundedCents)
    } catch (err: any) {
      throw new InternalServerError(`Failed to refund payment via Stripe: ${err.message}`)
    }
  }

  const updatedDispute = await db.$transaction(async (tx) => {
    const res = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        status,
        resolutionNotes,
        resolvedByAdminId: adminId,
        resolvedAt: new Date(),
        ...(status === 'RESOLVED_REFUND' ? { refundAmountCents: refundedCents } : {}),
      }
    })

    await tx.booking.update({
      where: { id: dispute.bookingId },
      data: {
        disputeStatus: status,
        // The Stripe refund above already succeeded synchronously, so reflect that
        // immediately rather than leaving paymentStatus stale (e.g. CAPTURED/PAYOUT_PENDING).
        // Matches the paymentStatus/refundedAt pair the Stripe webhook handler sets for
        // charge.refunded / refund.succeeded (stripeWebhookController.ts).
        //
        // Note this is set the same way for both full and partial refunds — REFUNDED does
        // not distinguish the two. releaseDuePayouts() excludes any RESOLVED_REFUND booking
        // from auto-payout regardless of amount (see cleanupJob.ts), so a partial refund's
        // remaining owner payout is a manual admin action for now, using
        // Dispute.refundAmountCents to know how much was already sent back to the renter.
        ...(status === 'RESOLVED_REFUND' ? { paymentStatus: PaymentStatus.REFUNDED, refundedAt: new Date() } : {}),
      }
    })

    await tx.bookingEvent.create({
      data: {
        bookingId: dispute.bookingId,
        actorId: adminId,
        type: BookingEventType.DISPUTE_RESOLVED,
        metadata: {
          disputeId,
          status,
          resolutionNotes,
          ...(status === 'RESOLVED_REFUND' ? { refundAmountCents: refundedCents } : {}),
        }
      }
    })

    return res
  })

  return updatedDispute
}