import { BookingEventType, DisputeReason, DisputeStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, ForbiddenError, InternalServerError, NotFoundError } from '../utils/errors'
import { cancelPaymentIntent, refundPaymentIntent, toCents } from './paymentService'

// Deposit resolution auto-releases 24h after return handoff completes (see
// cleanupJob.releaseDueDeposits) — a dispute must be filed before then to
// hold the deposit for review. Only applies to a COMPLETED booking (i.e.
// after return handoff); a booking still in progress has no completedAt to
// measure from and keeps the existing no-deadline behavior.
export const DISPUTE_WINDOW_HOURS = 24

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

  if (booking.status === 'COMPLETED' && booking.completedAt) {
    const windowEnd = new Date(booking.completedAt.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000)
    if (new Date() > windowEnd) {
      throw new BadRequestError(
        `The dispute window has closed. Disputes must be filed within ${DISPUTE_WINDOW_HOURS} hours of the booking completing.`
      )
    }
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

function formatCents(cents: number) {
  return (cents / 100).toFixed(2)
}

export async function resolveDispute(
  disputeId: string,
  adminId: string,
  status: DisputeStatus,
  resolutionNotes: string,
  refundAmountCents?: number,
  db: typeof prisma = prisma
) {
  // Just to resolve the bookingId to lock on below — re-read for real inside the
  // transaction once the lock is held, since this initial read has no consistency
  // guarantee against a concurrent resolution.
  const initialDispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!initialDispute) throw new NotFoundError('Dispute not found')

  // The whole read-validate-refund-write sequence runs inside one transaction, holding
  // a row lock on the booking for its duration. This is what makes the over-refund check
  // below race-safe: without it, two admins resolving two different (sequential) disputes
  // on the same booking could both read the same "amount already refunded so far" and both
  // pass validation, together refunding more than totalPrice — the exact bug this fix closes.
  // The Stripe network call happens inside this transaction too (not ideal to hold a
  // Postgres row lock across a network round-trip, but this is a low-frequency admin action
  // where correctness matters more than lock hold time, and splitting the lock from the
  // Stripe call would reopen the same race window).
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${initialDispute.bookingId} FOR UPDATE`

    const dispute = await tx.dispute.findUnique({
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

      // Prior disputes on this SAME booking that already issued a refund reduce what's
      // left to give back. A null refundAmountCents on an old row predates this field
      // always being populated and means "the full amount was refunded" (the old default
      // behavior), so it's treated as fullAmountCents rather than 0.
      const priorResolvedRefunds = await tx.dispute.findMany({
        where: { bookingId: dispute.bookingId, status: 'RESOLVED_REFUND', id: { not: disputeId } },
        select: { refundAmountCents: true },
      })
      const priorRefundedCents = priorResolvedRefunds.reduce(
        (sum, d) => sum + (d.refundAmountCents ?? fullAmountCents),
        0
      )
      const remainingRefundableCents = fullAmountCents - priorRefundedCents

      refundedCents = refundAmountCents ?? remainingRefundableCents

      if (refundAmountCents !== undefined && refundAmountCents > remainingRefundableCents) {
        throw new BadRequestError(
          `refundAmountCents cannot exceed the remaining refundable balance of $${formatCents(remainingRefundableCents)} (booking total minus prior refunds).`
        )
      }

      // A captured payment has actually moved funds onto a Charge, which is what
      // stripe.refunds.create operates on; an uncaptured authorization hold has not, and
      // Stripe rejects refunds.create against it — the correct operation there is
      // paymentIntents.cancel, same as handleCancellationPayment() in bookingService.ts
      // already does for pre-capture bookings.
      //
      // paymentStatus alone can't answer "was this ever captured?" once a refund has
      // already happened once: PaymentStatus.REFUNDED is set both for an actual Stripe
      // refund AND for a pre-capture cancellation (see stripeWebhookController.ts), and a
      // booking that already had one partial refund resolved sits at REFUNDED even though
      // its charge is still open for further refunds. `paidAt` doesn't have that
      // ambiguity — it's set exactly once, only by payment_intent.succeeded (a true
      // capture), and is never cleared afterward, so it reliably answers "was this ever
      // captured?" regardless of what paymentStatus became later. We read it from the
      // local DB (rather than re-fetching the PaymentIntent from Stripe) to stay
      // consistent with the existing paymentStatus-trusting precedent in
      // handleCancellationPayment(), kept in sync by stripeWebhookController.ts.
      if (dispute.booking.paidAt !== null) {
        try {
          await refundPaymentIntent(dispute.booking, refundedCents, dispute.id)
        } catch (err: any) {
          throw new InternalServerError(`Failed to refund payment via Stripe: ${err.message}`)
        }
      } else {
        // A partial refund pre-capture doesn't map to a single Stripe operation (there's
        // no captured Charge to partially refund, and capturing just the "kept" amount
        // would silently change what the resolution actually means). Rejecting keeps the
        // admin decision explicit: resolve as a full refund now, or wait until after the
        // payment is captured (post-pickup) to issue a partial one.
        if (refundAmountCents !== undefined && refundAmountCents < remainingRefundableCents) {
          throw new BadRequestError(
            'A partial refund is not possible before the payment has been captured. Resolve this dispute as a full refund, or wait until after pickup to issue a partial refund.'
          )
        }

        try {
          await cancelPaymentIntent(dispute.booking)
        } catch (err: any) {
          throw new InternalServerError(`Failed to cancel payment authorization via Stripe: ${err.message}`)
        }
      }
    }

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
}