import { BookingEventType, BookingStatus, DepositStatus, DisputeStatus, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, InternalServerError, NotFoundError } from '../utils/errors'
import { captureDepositPaymentIntent, chargeIdOf, toCents } from './paymentService'
import { payDepositCompensation } from './disputeService'
import { createReviewObligationsForCompletedBooking } from './bookingService'

// D-1: an admin can close out a rental that was never returned (or whose
// return was started but never confirmed by both taps).
export const CLOSE_OUT_STATUSES: BookingStatus[] = [BookingStatus.ACTIVE, BookingStatus.RETURN_PENDING]

/** Rentals the overdue job flagged and that are still open, oldest first. */
export function listOverdueBookings() {
  return prisma.booking.findMany({
    where: { status: { in: CLOSE_OUT_STATUSES }, overdueAt: { not: null } },
    orderBy: { overdueAt: 'asc' },
    take: 200,
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      pickedUpAt: true,
      overdueAt: true,
      depositAmount: true,
      depositStatus: true,
      disputeStatus: true,
      listing: { select: { id: true, title: true } },
      renter: { select: { id: true, firstName: true, email: true } },
      owner: { select: { id: true, firstName: true, email: true } },
    },
  })
}

/**
 * Completes an ACTIVE / RETURN_PENDING booking on the admin's say-so. The
 * owner's payout then follows the normal schedule (PAYOUT_HOLD_HOURS after
 * this completion, held by any dispute filed in the window). With
 * `depositCaptureCents` the deposit is charged through the same capture and
 * owner-transfer path a dispute uses; that is recorded as a resolved
 * ITEM_NOT_RETURNED dispute so the transfer key, its retry job and the
 * "deposit already resolved" rule all apply unchanged. Without it the hold is
 * released by the deposit job after the window, as on any completion.
 */
export async function closeOutBooking(bookingId: string, adminId: string, notes: string, depositCaptureCents?: number) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
      const booking = await tx.booking.findUnique({ where: { id: bookingId } })
      if (!booking) throw new NotFoundError('Booking not found.')
      if (!CLOSE_OUT_STATUSES.includes(booking.status)) {
        throw new BadRequestError('Only a rental that is out, or waiting on its return, can be closed out.')
      }

      let disputeId: string | undefined
      if (depositCaptureCents !== undefined) {
        if (booking.depositStatus !== DepositStatus.AUTHORIZED || !booking.stripeDepositPaymentIntentId) {
          throw new BadRequestError('This booking has no deposit hold to charge.')
        }
        const capCents = toCents(booking.depositAmount)
        if (depositCaptureCents > capCents) {
          throw new BadRequestError(`The deposit charge can't be more than the deposit of $${(capCents / 100).toFixed(2)}.`)
        }
        const open = await tx.dispute.findFirst({
          where: { bookingId, status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] } },
          select: { id: true },
        })
        if (open) {
          throw new BadRequestError('This booking has an open dispute. Close it out without a deposit charge, then charge the deposit when resolving that dispute.')
        }

        let depositChargeId: string | null
        try {
          depositChargeId = chargeIdOf(
            await captureDepositPaymentIntent({ id: booking.id, stripeDepositPaymentIntentId: booking.stripeDepositPaymentIntentId }, depositCaptureCents),
          )
        } catch (err: any) {
          throw new InternalServerError(`Failed to capture the deposit via Stripe: ${err.message}`)
        }

        const now = new Date()
        const dispute = await tx.dispute.create({
          data: {
            bookingId,
            raisedByUserId: adminId,
            reason: 'ITEM_NOT_RETURNED',
            description: notes,
            status: DisputeStatus.RESOLVED_REFUND,
            resolutionNotes: notes,
            resolvedByAdminId: adminId,
            resolvedAt: now,
            refundAmountCents: depositCaptureCents,
          },
        })
        disputeId = dispute.id
        await tx.booking.update({
          where: { id: bookingId },
          data: { depositStatus: DepositStatus.CAPTURED, stripeDepositChargeId: depositChargeId, disputeStatus: DisputeStatus.RESOLVED_REFUND },
        })
        await payDepositCompensation(tx, {
          bookingId,
          ownerId: booking.ownerId,
          disputeId,
          amountCents: depositCaptureCents,
          depositChargeId,
          actorId: adminId,
        })
      }

      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.COMPLETED,
          completedAt: new Date(),
          // Same as a confirmed return (handoffService): the captured rent becomes payable.
          ...(booking.paymentStatus === PaymentStatus.CAPTURED ? { paymentStatus: PaymentStatus.PAYOUT_PENDING } : {}),
          version: { increment: 1 },
        },
      })
      await createReviewObligationsForCompletedBooking(tx, booking)
      await tx.bookingEvent.create({
        data: {
          bookingId,
          actorId: adminId,
          type: BookingEventType.STATUS_CHANGE,
          metadata: {
            from: booking.status,
            to: BookingStatus.COMPLETED,
            reason: 'admin_close_out',
            notes,
            depositCapturedCents: depositCaptureCents ?? 0,
            ...(disputeId ? { disputeId } : {}),
          },
        },
      })
      return updated
    },
    { timeout: 30_000, maxWait: 10_000 },
  )
}
