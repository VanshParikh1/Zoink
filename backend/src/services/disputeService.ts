import { BookingEventType, DisputeReason, DisputeStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, ConflictError, ForbiddenError, InternalServerError, NotFoundError } from '../utils/errors'
import { cancelPaymentIntent, capturePaymentIntent, refundPaymentIntent, toCents, transferDepositCompensation } from './paymentService'
import { notifyUser } from './notificationService'

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

    // The deposit window check above and this one are independent: a first
    // dispute can resolve (capturing or releasing the deposit — see
    // resolveDispute's COMPLETED branch) well inside the 24h window, leaving
    // room for a second dispute to be filed before the window closes. Catch
    // that here instead of letting it fail later at resolution — the deposit
    // PaymentIntent has already been captured or canceled by that point, so
    // there is nothing left for a new dispute to act on.
    if (booking.depositStatus === 'CAPTURED' || booking.depositStatus === 'RELEASED') {
      throw new BadRequestError("This booking's deposit has already been resolved by a previous dispute.")
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
  const { dispute: result, releasedDepositNotice } = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${initialDispute.bookingId} FOR UPDATE`

    // Populated when the deposit hold is released back to the renter with no
    // charge (no damage found), so the renter can be notified after the commit
    // — matching cleanupJob.releaseDueDeposits's auto-release path.
    let releasedDepositNotice: { renterId: string; listingTitle: string } | null = null

    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      include: { booking: { include: { listing: { select: { title: true } } } } }
    })

    if (!dispute) throw new NotFoundError('Dispute not found')
    if (dispute.status === 'RESOLVED_REFUND' || dispute.status === 'RESOLVED_NO_ACTION' || dispute.status === 'DISMISSED') {
      throw new BadRequestError('Dispute is already resolved.')
    }

    let refundedCents: number | undefined
    let nextDepositStatus: 'CAPTURED' | 'RELEASED' | undefined
    // Set only by the pre-completion rental-refund branch below: the cumulative
    // cents refunded to the renter from the RENTAL payment (this refund + prior
    // ones), and whether that now covers the whole charge. releaseDuePayouts()
    // reads Booking.refundedAmountCents to pay the owner's proportional
    // remaining share instead of skipping the booking.
    let rentalRefundCumulativeCents: number | undefined
    let rentalRefundIsFull = false
    if (status === 'RESOLVED_REFUND' && dispute.booking.status === 'COMPLETED') {
      // Once a booking is COMPLETED, the rental payment has already been fully
      // captured and settled at pickup (see handoffService.confirmHandoff) —
      // the only thing a post-completion dispute can still act on is the
      // deposit, held as its own authorized-but-uncaptured PaymentIntent since
      // CONFIRMED (see bookingService.transitionBookingStatus and
      // cleanupJob.releaseDueDeposits). Resolving with a charge captures part
      // or all of that hold (damage found); resolving with none releases it.
      if (!dispute.booking.stripeDepositPaymentIntentId) {
        throw new ConflictError('No deposit PaymentIntent exists for this booking.')
      }

      // Unlike the pre-completion path below, which can issue several
      // sequential *refunds* against an already-captured Charge, a
      // manual-capture PaymentIntent can only be captured (or canceled) once —
      // Stripe has no concept of a second partial capture on top of one that
      // already happened. So the deposit can only be resolved by the first
      // dispute to reach this branch; a second dispute on the same booking
      // must be rejected outright rather than trying to divide up a pool that
      // no longer exists as an open authorization.
      if (dispute.booking.depositStatus !== 'AUTHORIZED') {
        throw new BadRequestError("This booking's deposit has already been resolved by a previous dispute.")
      }

      const depositCapCents = toCents(dispute.booking.depositAmount)
      refundedCents = refundAmountCents ?? depositCapCents

      if (refundAmountCents !== undefined && refundAmountCents > depositCapCents) {
        throw new BadRequestError(
          `refundAmountCents cannot exceed the deposit amount of $${formatCents(depositCapCents)}.`
        )
      }

      const depositIntentRef = {
        id: dispute.booking.id,
        version: dispute.booking.version,
        stripePaymentIntentId: dispute.booking.stripeDepositPaymentIntentId,
        totalPrice: new Prisma.Decimal(0),
        insuranceFee: new Prisma.Decimal(0),
        hstAmount: new Prisma.Decimal(0),
      }

      if (refundedCents > 0) {
        try {
          await capturePaymentIntent(depositIntentRef, refundedCents)
        } catch (err: any) {
          throw new InternalServerError(`Failed to capture the deposit via Stripe: ${err.message}`)
        }
        nextDepositStatus = 'CAPTURED'

        // The captured amount compensates the owner for the damage found —
        // none of it is platform revenue, so it's transferred in full, no
        // commission cut, right here rather than deferred: the admin's
        // decision is already final at this point (unlike the rental payout,
        // which waits out a hold window for possible disputes — there's
        // nothing left to wait for once the dispute that resolved THIS
        // deposit has itself been decided).
        const owner = await tx.user.findUnique({
          where: { id: dispute.booking.ownerId },
          select: { stripeAccountId: true },
        })

        if (owner?.stripeAccountId) {
          try {
            const transfer = await transferDepositCompensation(
              dispute.booking,
              owner.stripeAccountId,
              refundedCents,
              disputeId
            )
            await tx.bookingEvent.create({
              data: {
                bookingId: dispute.bookingId,
                actorId: adminId,
                type: BookingEventType.PAYOUT_TRIGGERED,
                metadata: {
                  stripeTransferId: transfer.id,
                  disputeId,
                  purpose: 'deposit_compensation',
                  amountCents: refundedCents,
                },
              },
            })
          } catch (err: any) {
            // The deposit has already been captured from the renter — that
            // can't be undone here, so a transfer failure must not fail the
            // whole resolution. Record it for manual follow-up instead.
            await tx.bookingEvent.create({
              data: {
                bookingId: dispute.bookingId,
                actorId: adminId,
                type: BookingEventType.ERROR,
                metadata: { action: 'deposit_compensation_transfer_failed', message: err.message },
              },
            })
          }
        } else {
          await tx.bookingEvent.create({
            data: {
              bookingId: dispute.bookingId,
              actorId: adminId,
              type: BookingEventType.ERROR,
              metadata: { action: 'deposit_compensation_transfer_skipped', reason: 'owner has no connected Stripe account' },
            },
          })
        }
      } else {
        try {
          await cancelPaymentIntent(depositIntentRef)
        } catch (err: any) {
          throw new InternalServerError(`Failed to release the deposit via Stripe: ${err.message}`)
        }
        nextDepositStatus = 'RELEASED'
        releasedDepositNotice = {
          renterId: dispute.booking.renterId,
          listingTitle: dispute.booking.listing.title,
        }
      }
    } else if (status === 'RESOLVED_REFUND') {
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

      rentalRefundCumulativeCents = priorRefundedCents + refundedCents
      rentalRefundIsFull = rentalRefundCumulativeCents >= fullAmountCents

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
        // For a post-completion (deposit-targeting) resolution, only depositStatus
        // moves — paymentStatus describes the rental payment's lifecycle, which was
        // already settled at pickup and is untouched by this resolution.
        ...(nextDepositStatus ? { depositStatus: nextDepositStatus } : {}),
        // Pre-completion rental refund only (a COMPLETED booking's rental payment
        // already settled at pickup and is untouched here — that path moves
        // depositStatus above instead). The Stripe refund/cancel already ran
        // synchronously, so reflect it now rather than waiting on the webhook.
        //
        //  - refundedAmountCents records the cumulative renter refund so
        //    releaseDuePayouts() can still release the owner's proportional
        //    remaining payout (or nothing, on a full refund).
        //  - paymentStatus only moves to REFUNDED when the refund actually
        //    covers the whole charge. A partial refund leaves it at
        //    CAPTURED/PAYOUT_PENDING so the booking isn't overstated as fully
        //    refunded (matches stripeWebhookController.ts's partial-refund path).
        ...(rentalRefundCumulativeCents !== undefined
          ? {
              refundedAmountCents: rentalRefundCumulativeCents,
              refundedAt: new Date(),
              ...(rentalRefundIsFull ? { paymentStatus: PaymentStatus.REFUNDED } : {}),
            }
          : {}),
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

    return { dispute: res, releasedDepositNotice }
  })

  if (releasedDepositNotice) {
    void notifyUser({
      userId: releasedDepositNotice.renterId,
      type: 'DEPOSIT_RELEASED',
      title: 'Deposit released',
      body: `Your security deposit for ${releasedDepositNotice.listingTitle} has been released back to you.`,
      data: { bookingId: initialDispute.bookingId },
    })
  }

  return result
}