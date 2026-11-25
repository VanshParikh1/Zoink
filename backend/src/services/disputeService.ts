import { BookingEventType, BookingStatus, DisputeReason, DisputeStatus, PaymentStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, ConflictError, ForbiddenError, InternalServerError, NotFoundError } from '../utils/errors'
import { cancelDepositPaymentIntent, cancelPaymentIntent, chargeIdOf, getRentalAuthorizationAmount, refundPaymentIntent, toCents } from './paymentService'
import * as paymentService from './paymentService'
import { notifyUser } from './notificationService'
import { loggableMessage } from '../utils/sentryScrub'

// Deposit resolution auto-releases 24h after return handoff completes (see
// cleanupJob.releaseDueDeposits) — a dispute must be filed before then to
// hold the deposit for review. Only applies to a COMPLETED booking (i.e.
// after return handoff); a booking still in progress has no completedAt to
// measure from and keeps the existing no-deadline behavior.
export const DISPUTE_WINDOW_HOURS = 24

// F-13: a dispute needs a paid booking. Before CONFIRMED there's no money to
// act on, and resolving one with a refund used to fail as a 500.
const DISPUTABLE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PICKUP_PENDING,
  BookingStatus.ACTIVE,
  BookingStatus.RETURN_PENDING,
  BookingStatus.COMPLETED,
]

export async function createDispute(
  bookingId: string,
  requesterId: string,
  reason: DisputeReason,
  description: string,
  db: typeof prisma = prisma
) {
  // One transaction holding the booking row: two filings racing each other (a
  // double tap, or both parties at once) used to both pass the "no open
  // dispute" check and open two disputes, and a filing racing the deposit
  // release job at the 24-hour mark could open a dispute on a deposit the job
  // was releasing. The job takes the same lock (cleanupJob.releaseDueDeposits).
  return db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    if (!locked) throw new NotFoundError('Booking not found')

    const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } })

    if (booking.renterId !== requesterId && booking.ownerId !== requesterId) {
      throw new ForbiddenError('Only the renter or owner can open a dispute for this booking.')
    }

    if (!DISPUTABLE_STATUSES.includes(booking.status)) {
      throw new BadRequestError('A dispute can only be opened on a booking that has been paid for.')
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

    const existing = await tx.dispute.findFirst({
      where: { bookingId, status: { notIn: ['RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED'] } }
    })

    if (existing) {
      throw new BadRequestError('An open dispute already exists for this booking.')
    }

    const dispute = await tx.dispute.create({
      data: {
        bookingId,
        raisedByUserId: requesterId,
        reason,
        description,
        status: 'OPEN',
      },
    })

    await tx.bookingEvent.create({
      data: {
        bookingId,
        actorId: requesterId,
        type: BookingEventType.DISPUTE_OPENED,
        metadata: { disputeId: dispute.id, reason },
      }
    })

    await tx.booking.update({
      where: { id: bookingId },
      data: { disputeStatus: 'OPEN' }
    })

    return dispute
  })
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
  refundTarget?: 'RENT' | 'DEPOSIT',
  db: typeof prisma = prisma
) {
  // Just to resolve the bookingId to lock on below — re-read for real inside the
  // transaction once the lock is held, since this initial read has no consistency
  // guarantee against a concurrent resolution.
  const initialDispute = await db.dispute.findUnique({ where: { id: disputeId } })
  if (!initialDispute) throw new NotFoundError('Dispute not found')

  // P1-1: a deposit charge commits its intent and captures before the main
  // transaction, so a rollback there can't forget a capture Stripe made. Cases
  // this pre-step skips (wrong status, over the cap, already resolved) are
  // refused by the main transaction's checks below.
  let capturedDepositChargeId: string | null | undefined
  if (status === 'RESOLVED_REFUND' && refundTarget !== 'RENT') {
    const toCapture = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${initialDispute.bookingId} FOR UPDATE`
      const d = await tx.dispute.findUnique({ where: { id: disputeId }, include: { booking: true } })
      if (!d || d.status === 'RESOLVED_REFUND' || d.status === 'RESOLVED_NO_ACTION' || d.status === 'DISMISSED') return null
      const b = d.booking
      if (b.status !== 'COMPLETED' || !b.stripeDepositPaymentIntentId) return null
      const capCents = toCents(b.depositAmount)
      const cents = refundAmountCents ?? capCents
      if (cents <= 0 || cents > capCents) return null
      if (b.depositStatus !== 'AUTHORIZED' && b.depositCaptureCents === null) return null
      await recordDepositCaptureIntent(tx, b, cents, adminId, { disputeId })
      return { id: b.id, stripeDepositPaymentIntentId: b.stripeDepositPaymentIntentId, cents }
    }, DEPOSIT_TX_OPTIONS)
    if (toCapture) capturedDepositChargeId = await captureDeposit(toCapture, toCapture.cents, db)
  }
  let payOwner = false

  // The whole read-validate-refund-write sequence runs inside one transaction, holding
  // a row lock on the booking for its duration. This is what makes the over-refund check
  // below race-safe: without it, two admins resolving two different (sequential) disputes
  // on the same booking could both read the same "amount already refunded so far" and both
  // pass validation, together refunding more than totalPrice — the exact bug this fix closes.
  // A deposit charge's capture and transfer run outside it (above and after it);
  // a rent refund or cancel still runs inside, keyed per dispute.
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
    // F-18: a rent refund before pickup ends the booking.
    let cancelsBooking = false
    const isCompleted = dispute.booking.status === 'COMPLETED'
    // P1-1: a deposit charge started for this dispute (and maybe captured on
    // Stripe) can only be finished, not replaced by another outcome.
    if (isCompleted && capturedDepositChargeId === undefined && dispute.booking.depositCaptureCents !== null && dispute.booking.depositStatus !== 'RELEASED') {
      throw depositChargeInProgress(dispute.booking.depositCaptureCents)
    }
    if (status === 'RESOLVED_REFUND' && refundTarget === 'DEPOSIT' && !isCompleted) {
      throw new BadRequestError('The deposit can only be charged once the booking is completed.')
    }
    // D-4: after completion an admin may refund rent instead of charging the
    // deposit. The payout can't have gone out yet: an OPEN dispute holds it
    // (cleanupJob.releaseDuePayouts) and disputes close at the same 24 h mark
    // the hold ends. Refused anyway if it somehow did, rather than paying twice.
    if (status === 'RESOLVED_REFUND' && isCompleted && refundTarget === 'RENT' && dispute.booking.payoutSentAt) {
      throw new BadRequestError("The owner has already been paid for this booking, so the rent can't be refunded here.")
    }
    if (status === 'RESOLVED_REFUND' && isCompleted && refundTarget !== 'RENT') {
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
      if (dispute.booking.depositStatus !== 'AUTHORIZED' && capturedDepositChargeId === undefined) {
        throw new BadRequestError("This booking's deposit has already been resolved by a previous dispute.")
      }

      const depositCapCents = toCents(dispute.booking.depositAmount)
      refundedCents = refundAmountCents ?? depositCapCents

      if (refundAmountCents !== undefined && refundAmountCents > depositCapCents) {
        throw new BadRequestError(
          `refundAmountCents cannot exceed the deposit amount of $${formatCents(depositCapCents)}.`
        )
      }

      // Keyed on the deposit PaymentIntent (captured or released at most
      // once), not the booking version the rental's own capture/cancel keys
      // use, so the two can never collide.
      const depositIntentRef = {
        id: dispute.booking.id,
        stripeDepositPaymentIntentId: dispute.booking.stripeDepositPaymentIntentId,
      }

      if (refundedCents > 0) {
        // Captured before this transaction (P1-1). Missing only if the booking
        // changed between the two steps (e.g. it completed in between).
        if (capturedDepositChargeId === undefined) {
          throw new ConflictError('The booking changed while this was being resolved. Try again.')
        }
        nextDepositStatus = 'CAPTURED'
        await tx.booking.update({
          where: { id: dispute.bookingId },
          data: { stripeDepositChargeId: dispute.booking.stripeDepositChargeId ?? capturedDepositChargeId },
        })
        // The captured amount compensates the owner in full, no commission,
        // after this commits (payDepositCompensation); a failed transfer is
        // retried by cleanupJob.retryDepositCompensations.
        payOwner = true
      } else {
        try {
          await cancelDepositPaymentIntent(depositIntentRef)
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
      // What the rent PaymentIntent actually charged: rent + insurance + any
      // HST (F-03). Old bookings carry HST, new ones (D-2) don't.
      const fullAmountCents = getRentalAuthorizationAmount(dispute.booking)

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
          `refundAmountCents cannot exceed the remaining refundable balance of $${formatCents(remainingRefundableCents)} (amount charged minus prior refunds).`
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

        // F-18: before pickup the renter is getting all of the rent back, so
        // the rental isn't going ahead: cancel the booking and release the
        // deposit hold in the same resolution instead of leaving both alive.
        if (dispute.booking.status === 'CONFIRMED' || dispute.booking.status === 'PICKUP_PENDING') {
          cancelsBooking = true
          if (dispute.booking.stripeDepositPaymentIntentId && dispute.booking.depositStatus === 'AUTHORIZED') {
            try {
              await cancelDepositPaymentIntent({ id: dispute.booking.id, stripeDepositPaymentIntentId: dispute.booking.stripeDepositPaymentIntentId })
            } catch (err: any) {
              throw new InternalServerError(`Failed to release the deposit via Stripe: ${err.message}`)
            }
            nextDepositStatus = 'RELEASED'
            releasedDepositNotice = { renterId: dispute.booking.renterId, listingTitle: dispute.booking.listing.title }
          }
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
        ...(cancelsBooking ? { status: BookingStatus.CANCELLED, version: { increment: 1 } } : {}),
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

    if (cancelsBooking) {
      await tx.bookingEvent.create({
        data: {
          bookingId: dispute.bookingId,
          actorId: adminId,
          type: BookingEventType.STATUS_CHANGE,
          metadata: { from: dispute.booking.status, to: BookingStatus.CANCELLED, reason: 'dispute_refund', disputeId },
        },
      })
    }

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

  if (payOwner) await payDepositCompensation(initialDispute.bookingId, adminId, {}, db)

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

// ── P1-1: charging a deposit ────────────────────────────────────────────────
// The decision to charge (who, how much, why) is committed first
// (recordDepositCaptureIntent), then Stripe captures outside any transaction
// (captureDeposit), then the caller writes its final state, then the owner is
// paid (payDepositCompensation). A crash after the capture leaves the intent:
// the webhook or reconciliation links the charge and the retry job pays the
// owner; a retried close-out or resolution gets the same capture back.

export const DEPOSIT_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }

/** Inside the caller's locked transaction. A retry of the same decision passes
 *  with the intent already there; a different amount is refused, since Stripe
 *  may already have captured the first one. */
export async function recordDepositCaptureIntent(
  tx: Prisma.TransactionClient,
  booking: { id: string; ownerId: string; depositCaptureCents: number | null },
  amountCents: number,
  actorId: string,
  why: Record<string, string>
) {
  if (booking.depositCaptureCents !== null) {
    if (booking.depositCaptureCents !== amountCents) throw depositChargeInProgress(booking.depositCaptureCents)
    return
  }
  await tx.booking.update({ where: { id: booking.id }, data: { depositCaptureCents: amountCents } })
  await tx.bookingEvent.create({
    data: {
      bookingId: booking.id,
      actorId,
      type: BookingEventType.DEPOSIT_CAPTURE_REQUESTED,
      metadata: { amountCents, ownerId: booking.ownerId, ...why },
    },
  })
}

/** The 409 for any other action while a started deposit charge isn't finished. */
export function depositChargeInProgress(cents: number) {
  return new ConflictError(`A deposit charge of $${formatCents(cents)} was already started for this booking. Retry with that amount to finish it.`)
}

/** Captures the deposit (no transaction held) and returns the charge id. A
 *  capture an earlier attempt already made is read back from Stripe. If the
 *  hold is gone, the intent is cleared and the deposit marked released (400).
 *  Any other failure keeps the intent: the outcome is unknown, and a retry
 *  (same idempotency key) or the webhook settles it. */
export async function captureDeposit(booking: { id: string; stripeDepositPaymentIntentId: string }, amountCents: number, db: typeof prisma = prisma) {
  let intent: any
  try {
    intent = await paymentService.captureDepositPaymentIntent(booking, amountCents)
  } catch (err: any) {
    let current: any = null
    try {
      current = await paymentService.retrievePaymentIntent(booking.stripeDepositPaymentIntentId)
    } catch {
      // Unknown outcome; handled below as a failure that keeps the intent.
    }
    if (current?.status === 'succeeded') {
      intent = current
    } else if (current?.status === 'canceled') {
      await db.booking.update({ where: { id: booking.id }, data: { depositCaptureCents: null, depositStatus: 'RELEASED' } })
      throw new BadRequestError('The deposit hold has expired or was released, so it can no longer be charged.')
    } else {
      throw new InternalServerError(`Failed to capture the deposit via Stripe: ${err.message}`)
    }
  }
  return chargeIdOf(intent)
}

/** Transfers a captured deposit to the owner and records it on the booking
 *  (stripeDepositTransferId), or records why it couldn't. Runs outside any
 *  transaction and never throws: a failure is left for
 *  cleanupJob.retryDepositCompensations. The idempotency key is the booking's,
 *  so every attempt for one deposit is the same transfer; `checkExisting`
 *  (the retry job) also looks the transfer up on Stripe, for attempts older
 *  than the key's 24 h. Returns whether the owner is now recorded as paid. */
export async function payDepositCompensation(
  bookingId: string,
  actorId: string | null,
  opts: { checkExisting?: boolean } = {},
  db: typeof prisma = prisma
): Promise<boolean> {
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      createdAt: true,
      depositStatus: true,
      depositCaptureCents: true,
      stripeDepositChargeId: true,
      stripeDepositTransferId: true,
      owner: { select: { stripeAccountId: true } },
    },
  })
  if (booking.stripeDepositTransferId) return true
  if (booking.depositStatus !== 'CAPTURED' || !booking.stripeDepositChargeId) return false
  // Rows captured before depositCaptureCents existed: the dispute that charged it.
  const amountCents =
    booking.depositCaptureCents ??
    (
      await db.dispute.findFirst({
        where: { bookingId, status: DisputeStatus.RESOLVED_REFUND, refundAmountCents: { gt: 0 } },
        orderBy: { resolvedAt: 'desc' },
        select: { refundAmountCents: true },
      })
    )?.refundAmountCents
  if (!amountCents) return false

  const accountId = booking.owner.stripeAccountId
  if (!accountId) {
    await db.bookingEvent.create({
      data: {
        bookingId,
        actorId,
        type: BookingEventType.ERROR,
        metadata: { action: 'deposit_compensation_transfer_skipped', reason: 'owner has no connected Stripe account' },
      },
    })
    return false
  }

  try {
    const existing = opts.checkExisting ? await paymentService.findDepositCompensationTransfer(bookingId, accountId, booking.createdAt) : null
    const transfer =
      existing ?? (await paymentService.transferDepositCompensation({ id: bookingId }, accountId, amountCents, booking.stripeDepositChargeId))
    // Two payers at once (an admin request and the job) send the same keyed
    // transfer; only the first records it.
    const { count } = await db.booking.updateMany({
      where: { id: bookingId, stripeDepositTransferId: null },
      data: { stripeDepositTransferId: transfer.id },
    })
    if (count) {
      await db.bookingEvent.create({
        data: {
          bookingId,
          actorId,
          type: BookingEventType.PAYOUT_TRIGGERED,
          metadata: { stripeTransferId: transfer.id, purpose: 'deposit_compensation', amountCents },
        },
      })
    }
    return true
  } catch (err) {
    await db.bookingEvent.create({
      data: {
        bookingId,
        actorId,
        type: BookingEventType.ERROR,
        metadata: { action: 'deposit_compensation_transfer_failed', message: loggableMessage(err) },
      },
    })
    return false
  }
}
