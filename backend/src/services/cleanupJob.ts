import { BookingEventType, BookingStatus, DepositStatus, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { cancelPaymentIntent, transferPayout } from './paymentService'

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
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      completedAt: { lte: dueBefore },
      // A dispute resolved as RESOLVED_NO_ACTION or DISMISSED means no money moved and
      // the booking should become payout-eligible again, same as if it never had a dispute.
      // RESOLVED_REFUND is deliberately excluded — including for PARTIAL refunds, not just
      // full ones: that path already refunded the renter via Stripe (see
      // disputeService.resolveDispute), and this job does not know how to derive the
      // owner's remaining share automatically (it never recalculates `ownerPayout`, it just
      // reads the value stored at booking-creation time). Rather than guess a policy for
      // splitting a partial refund between the platform's commission and the owner's cut,
      // any RESOLVED_REFUND booking is excluded from auto-payout entirely and the owner's
      // remaining payout (if any) is a manual admin action — see Dispute.refundAmountCents
      // for the amount actually refunded. OPEN/UNDER_REVIEW stay excluded since unresolved.
      disputeStatus: { in: ['NONE', 'RESOLVED_NO_ACTION', 'DISMISSED'] },
    },
    select: {
      id: true,
      version: true,
      ownerPayout: true,
      owner: { select: { stripeAccountId: true } },
    },
  })

  let paid = 0
  for (const booking of bookings) {
    if (!booking.owner.stripeAccountId) continue

    const transfer = await transferPayout(booking, booking.owner.stripeAccountId)
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
          metadata: { stripeTransferId: transfer.id, holdHours },
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
    released += 1
  }

  return { checked: bookings.length, released }
}
