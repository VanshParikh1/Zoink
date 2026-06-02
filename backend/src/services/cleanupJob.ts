import { BookingEventType, BookingStatus, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { transferPayout } from './paymentService'

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
      disputeStatus: 'NONE',
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
