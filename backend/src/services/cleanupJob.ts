import { BookingEventType, BookingStatus, DepositStatus, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { cancelPaymentIntent, toCents, transferPayout } from './paymentService'
import { notifyUser } from './notificationService'

export async function cleanupStaleHandoffs() {
  const staleBefore = new Date(Date.now() - Number(process.env.ZOINK_TAP_WINDOW_MS ?? 5 * 60 * 1000))

  const result = await prisma.booking.updateMany({
    where: {
      status: { in: [BookingStatus.PICKUP_PENDING, BookingStatus.RETURN_PENDING] },
      OR: [
        { ownerPickupTappedAt: { lt: staleBefore }, renterPickupTappedAt: null },
        { renterPickupTappedAt: { lt: staleBefore }, ownerPickupTappedAt: null },
        { ownerReturnTappedAt: { lt: staleBefore }, renterReturnTappedAt: null },
        { renterReturnTappedAt: { lt: staleBefore }, ownerReturnTappedAt: null },
      ],
    },
    data: {
      ownerPickupTappedAt: null,
      renterPickupTappedAt: null,
      ownerReturnTappedAt: null,
      renterReturnTappedAt: null,
      version: { increment: 1 },
    },
  })

  return { cleared: result.count }
}

export async function releaseDuePayouts() {
  const holdHours = Number(process.env.PAYOUT_HOLD_HOURS ?? 24)
  const dueBefore = new Date(Date.now() - holdHours * 60 * 60 * 1000)

  const bookings = await prisma.booking.findMany({
    where: {
      status: BookingStatus.COMPLETED,
      completedAt: { lte: dueBefore },
      // payoutSentAt is the single "this booking's payout has been dealt with"
      // marker — set both when a transfer is sent and when a fully-refunded
      // booking is closed out with nothing to send, so neither is reprocessed.
      payoutSentAt: null,
      OR: [
        // Never disputed, disputed with no money movement, or a dispute that
        // refunded the renter partially (paymentStatus stays PAYOUT_PENDING —
        // see disputeService/stripeWebhookController). RESOLVED_REFUND is no
        // longer excluded: the owner's proportional remaining share is computed
        // below from Booking.refundedAmountCents instead of being left as a
        // manual admin action. OPEN/UNDER_REVIEW stay out (unresolved).
        {
          paymentStatus: PaymentStatus.PAYOUT_PENDING,
          disputeStatus: { in: ['NONE', 'RESOLVED_NO_ACTION', 'DISMISSED', 'RESOLVED_REFUND'] },
        },
        // A dispute that refunded the renter the FULL charge leaves the booking
        // at REFUNDED. The owner is owed nothing, but it still needs closing out
        // (payoutSentAt) so this job stops looking at it.
        {
          paymentStatus: PaymentStatus.REFUNDED,
          disputeStatus: 'RESOLVED_REFUND',
        },
      ],
    },
    select: {
      id: true,
      version: true,
      ownerPayout: true,
      totalPrice: true,
      refundedAmountCents: true,
      disputeStatus: true,
      owner: { select: { stripeAccountId: true } },
    },
  })

  let paid = 0
  for (const booking of bookings) {
    const totalCents = toCents(booking.totalPrice)
    const fullOwnerPayoutCents = toCents(booking.ownerPayout)
    const refundedToRenterCents = Math.min(Math.max(booking.refundedAmountCents, 0), totalCents)

    // The owner's cut of what the renter actually kept paying, proportional to
    // their share of the original total (so the platform eats its commission on
    // the refunded slice too). With refundedToRenterCents === 0 — the common
    // case — this is exactly fullOwnerPayoutCents.
    const remainingPayoutCents =
      totalCents > 0
        ? Math.max(
            0,
            Math.round(((totalCents - refundedToRenterCents) * fullOwnerPayoutCents) / totalCents),
          )
        : 0

    // Fully refunded (or a $0 payout): nothing to transfer. Close it out so it
    // isn't reconsidered every tick.
    if (remainingPayoutCents <= 0) {
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: { payoutSentAt: new Date(), version: { increment: 1 } },
        })
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            type: BookingEventType.PAYOUT_TRIGGERED,
            metadata: { amountCents: 0, reason: 'fully_refunded', holdHours },
          },
        })
      })
      continue
    }

    if (!booking.owner.stripeAccountId) continue

    const transfer = await transferPayout(booking, booking.owner.stripeAccountId, remainingPayoutCents)
    const isPartial = remainingPayoutCents !== fullOwnerPayoutCents
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: PaymentStatus.PAID_OUT,
          stripeTransferId: transfer.id,
          payoutSentAt: new Date(),
          version: { increment: 1 },
        },
      })

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: BookingEventType.PAYOUT_TRIGGERED,
          metadata: {
            stripeTransferId: transfer.id,
            holdHours,
            amountCents: remainingPayoutCents,
            ...(isPartial
              ? { partialRefundToRenterCents: refundedToRenterCents, fullOwnerPayoutCents }
              : {}),
          },
        },
      })
    })
    paid += 1
  }

  return { checked: bookings.length, paid }
}

/** Auto-releases a booking's deposit once it's been held past the dispute
 *  filing window with no dispute filed (see disputeService.DISPUTE_WINDOW_HOURS).
 *  The deposit is authorized as its own PaymentIntent since CONFIRMED (see
 *  bookingService.transitionBookingStatus) and stays that way until either a
 *  dispute resolves it (disputeService.resolveDispute) or this job cancels it. */
export async function releaseDueDeposits() {
  const holdHours = Number(process.env.DEPOSIT_HOLD_HOURS ?? 24)
  const dueBefore = new Date(Date.now() - holdHours * 60 * 60 * 1000)

  const bookings = await prisma.booking.findMany({
    where: {
      status: BookingStatus.COMPLETED,
      depositStatus: DepositStatus.AUTHORIZED,
      completedAt: { lte: dueBefore },
      // Once a dispute resolves as RESOLVED_REFUND, depositStatus already moved
      // to CAPTURED or RELEASED (see disputeService.resolveDispute), so this
      // query no longer matches it regardless of this filter — the only thing
      // left to exclude here is a dispute that's still actually open, which
      // must hold the deposit until it's resolved one way or the other.
      disputeStatus: { notIn: ['OPEN', 'UNDER_REVIEW'] },
    },
    select: {
      id: true,
      version: true,
      stripeDepositPaymentIntentId: true,
      renterId: true,
      listing: { select: { title: true } },
    },
  })

  let released = 0
  for (const booking of bookings) {
    if (!booking.stripeDepositPaymentIntentId) continue

    await cancelPaymentIntent({
      id: booking.id,
      version: booking.version,
      stripePaymentIntentId: booking.stripeDepositPaymentIntentId,
    })

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          depositStatus: DepositStatus.RELEASED,
          version: { increment: 1 },
        },
      })

      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: BookingEventType.PAYMENT_REFUNDED,
          metadata: { action: 'deposit_released', holdHours },
        },
      })
    })

    void notifyUser({
      userId: booking.renterId,
      type: 'DEPOSIT_RELEASED',
      title: 'Deposit released',
      body: `Your security deposit for ${booking.listing.title} has been released back to you.`,
      data: { bookingId: booking.id },
    })
    released += 1
  }

  return { checked: bookings.length, released }
}
