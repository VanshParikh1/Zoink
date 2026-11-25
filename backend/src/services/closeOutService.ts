import { Booking, BookingEventType, BookingStatus, DepositStatus, DisputeStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, NotFoundError } from '../utils/errors'
import { toCents } from './paymentService'
import { captureDeposit, DEPOSIT_TX_OPTIONS, depositChargeInProgress, payDepositCompensation, recordDepositCaptureIntent } from './disputeService'
import { createReviewObligationsForCompletedBooking } from './bookingService'
import { notifyUser } from './notificationService'
import { formatDateTime, PAYOUT_HOLD_HOURS } from '@zoink/shared'

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
 * this completion, held by any dispute filed in the window). Without
 * `depositCaptureCents` the hold is released by the deposit job after the
 * window, as on any completion, and everything happens in one transaction.
 *
 * With it (P1-1): (1) the decision to charge is committed, (2) Stripe captures
 * with no transaction held, (3) the completion is written, recorded as a
 * resolved ITEM_NOT_RETURNED dispute so the "deposit already resolved" rule
 * applies, (4) the owner is paid under the booking's own transfer key. A
 * retry after a crash at any point repeats the same decision and ends in the
 * same state; see disputeService's P1-1 helpers.
 */
export async function closeOutBooking(bookingId: string, adminId: string, notes: string, depositCaptureCents?: number) {
  const lockAndRead = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { listing: { select: { title: true } } } })
    if (!booking) throw new NotFoundError('Booking not found.')
    if (!CLOSE_OUT_STATUSES.includes(booking.status)) {
      throw new BadRequestError('Only a rental that is out, or waiting on its return, can be closed out.')
    }
    return booking
  }
  type Locked = Awaited<ReturnType<typeof lockAndRead>>

  const complete = async (tx: Prisma.TransactionClient, booking: Locked, disputeId?: string) => {
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
    return { updated, booking }
  }

  let result: { updated: Booking; booking: Locked }
  if (depositCaptureCents === undefined) {
    result = await prisma.$transaction(async (tx) => {
      const booking = await lockAndRead(tx)
      if (booking.depositCaptureCents !== null && booking.depositStatus !== DepositStatus.RELEASED) {
        throw depositChargeInProgress(booking.depositCaptureCents)
      }
      return complete(tx, booking)
    }, DEPOSIT_TX_OPTIONS)
  } else {
    const cents = depositCaptureCents
    // (1) The decision, committed before Stripe is called.
    const ref = await prisma.$transaction(async (tx) => {
      const booking = await lockAndRead(tx)
      const retrying = booking.depositCaptureCents !== null
      if (!booking.stripeDepositPaymentIntentId || (!retrying && booking.depositStatus !== DepositStatus.AUTHORIZED)) {
        throw new BadRequestError('This booking has no deposit hold to charge.')
      }
      const capCents = toCents(booking.depositAmount)
      if (cents > capCents) {
        throw new BadRequestError(`The deposit charge can't be more than the deposit of $${(capCents / 100).toFixed(2)}.`)
      }
      const open = await tx.dispute.findFirst({
        where: { bookingId, status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] } },
        select: { id: true },
      })
      if (open) {
        throw new BadRequestError('This booking has an open dispute. Close it out without a deposit charge, then charge the deposit when resolving that dispute.')
      }
      await recordDepositCaptureIntent(tx, booking, cents, adminId, { reason: 'admin_close_out', notes })
      return { id: booking.id, stripeDepositPaymentIntentId: booking.stripeDepositPaymentIntentId }
    }, DEPOSIT_TX_OPTIONS)

    // (2) The capture, no transaction held.
    const depositChargeId = await captureDeposit(ref, cents)

    // (3) The completion. A concurrent close-out that finished first makes this a 400.
    result = await prisma.$transaction(async (tx) => {
      const booking = await lockAndRead(tx)
      const dispute = await tx.dispute.create({
        data: {
          bookingId,
          raisedByUserId: adminId,
          reason: 'ITEM_NOT_RETURNED',
          description: notes,
          status: DisputeStatus.RESOLVED_REFUND,
          resolutionNotes: notes,
          resolvedByAdminId: adminId,
          resolvedAt: new Date(),
          refundAmountCents: cents,
        },
      })
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          depositStatus: DepositStatus.CAPTURED,
          stripeDepositChargeId: booking.stripeDepositChargeId ?? depositChargeId,
          disputeStatus: DisputeStatus.RESOLVED_REFUND,
        },
      })
      return complete(tx, booking, dispute.id)
    }, DEPOSIT_TX_OPTIONS)

    // (4) The owner's compensation; a failure is retried by the job.
    await payDepositCompensation(bookingId, adminId)
  }
  const { updated, booking } = result
  const title = booking.listing.title

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const depositCents = toCents(booking.depositAmount)
  const depositHeld = booking.depositStatus === DepositStatus.AUTHORIZED
  const depositLine = depositCaptureCents
    ? ` ${money(depositCaptureCents)} of your ${money(depositCents)} deposit was charged${depositCaptureCents < depositCents ? ' and the rest of the hold was released' : ''}.`
    : depositHeld
      ? ` Your ${money(depositCents)} deposit hold will be released in 24 hours unless a dispute is opened.`
      : ''
  void notifyUser({
    userId: booking.renterId,
    type: 'BOOKING_CLOSED_OUT',
    title: 'Rental closed out',
    body: `The Zoink team closed out your rental of ${title}.${depositLine}`,
    data: { bookingId },
  })
  const payoutDue = new Date(updated.completedAt!.getTime() + PAYOUT_HOLD_HOURS * 60 * 60 * 1000)
  void notifyUser({
    userId: booking.ownerId,
    type: 'BOOKING_CLOSED_OUT',
    title: 'Rental completed',
    body: `The Zoink team marked the rental of ${title} as completed. Your payout is due ${formatDateTime(payoutDue)}, unless a dispute is opened before then.${depositCaptureCents ? ` ${money(depositCaptureCents)} from the deposit is being sent to you.` : ''}`,
    data: { bookingId },
  })
  return updated
}
