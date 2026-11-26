import { BookingEventType } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, NotFoundError } from '../utils/errors'
import { releaseDuePayouts } from './cleanupJob'

// P3-12 follow-up: payouts the job parked after a permanent Stripe refusal
// (bookings.payoutBlockedAt), and the admin action that clears the flag once
// the cause is fixed (e.g. the owner finished their Stripe onboarding).

/** Blocked payouts, oldest first, each with the Stripe error that blocked it. */
export async function listBlockedPayouts() {
  const rows = await prisma.booking.findMany({
    where: { payoutBlockedAt: { not: null }, payoutSentAt: null },
    orderBy: { payoutBlockedAt: 'asc' },
    take: 200,
    select: {
      id: true,
      payoutBlockedAt: true,
      ownerPayout: true,
      completedAt: true,
      listing: { select: { id: true, title: true } },
      owner: { select: { id: true, firstName: true, email: true } },
      events: {
        where: { type: BookingEventType.ERROR, metadata: { path: ['action'], equals: 'release_payout' } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { metadata: true },
      },
    },
  })
  return rows.map(({ events, ...row }) => ({
    ...row,
    blockedReason: ((events[0]?.metadata as { message?: unknown } | null)?.message as string | undefined) ?? null,
  }))
}

/** Clears the flag and tries this one payout again now. The result says what
 *  happened: paid, failed (it stays due; the job retries), or blocked again. */
export async function unblockPayout(bookingId: string, adminId: string) {
  await prisma.$transaction(
    async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
      if (!locked) throw new NotFoundError('Booking not found.')
      const booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { payoutBlockedAt: true } })
      if (!booking.payoutBlockedAt) throw new BadRequestError("This booking's payout isn't blocked.")
      await tx.booking.update({ where: { id: bookingId }, data: { payoutBlockedAt: null } })
      await tx.bookingEvent.create({
        data: {
          bookingId,
          actorId: adminId,
          type: BookingEventType.PAYOUT_UNBLOCKED,
          metadata: { blockedAt: booking.payoutBlockedAt.toISOString() },
        },
      })
    },
    { timeout: 30_000, maxWait: 10_000 }
  )

  const run = await releaseDuePayouts({ bookingId })
  const result = run.paid ? 'paid' : run.blocked ? 'blocked' : run.failed ? 'failed' : 'not_due'
  return { bookingId, result }
}
