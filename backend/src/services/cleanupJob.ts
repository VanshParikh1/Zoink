import { BookingEventType, BookingStatus, DepositStatus, DisputeStatus, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { cancelPaymentIntent, toCents, transferPayout } from './paymentService'
import { notifyUser } from './notificationService'
import { DEPOSIT_HOLD_HOURS, PAYOUT_HOLD_HOURS, ZOINK_TAP_WINDOW_MS } from '../config/bookingWindows'

export async function cleanupStaleHandoffs() {
  const staleBefore = new Date(Date.now() - ZOINK_TAP_WINDOW_MS)

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
  const holdHours = PAYOUT_HOLD_HOURS
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
  const holdHours = DEPOSIT_HOLD_HOURS
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

// ── Retention sweeps (privacy.md §7) ─────────────────────────────────────────
// These make the retention table in privacy.md true rather than aspirational.
// Run on a slower cadence than the payment jobs above (see index.ts — daily is
// plenty; nothing here is time-critical the way a payout or deposit release
// is). Two things this file deliberately does NOT do, because they're outside
// what a DB sweep can safely touch:
//   - Error/diagnostic log retention (90 days) is a Sentry project setting,
//     not application code — set it in the Sentry dashboard.
//   - Listing hard-deletion is immediate today (listingService.deleteListing
//     calls prisma.listing.delete directly), which already satisfies "gone
//     within 90 days" — trivially, since it's gone within zero. The 90-day
//     figure in privacy.md was written assuming a soft-delete grace period
//     that was never built; if that's ever added (e.g. to preserve evidence
//     for a dispute filed just after a listing is pulled), it needs a
//     deletedAt column on Listing and its own purge sweep here.
// See legal/OPEN-ITEMS.md, section C ("Retention periods").

const RETENTION_MESSAGES_MONTHS = 24
const RETENTION_DISPUTES_REPORTS_YEARS = 3
// Handoff/condition photos are evidence for a damage claim, not the
// transaction record itself — the Booking row they live on stays for the full
// 7-year CRA requirement (see purgeOldMessages's sibling note below); only the
// photo URLs are cleared. 90-day pad past the 12-month baseline covers a
// dispute still working through resolution right at the 12-month mark.
const RETENTION_HANDOFF_PHOTOS_MONTHS = 12
const RETENTION_HANDOFF_PHOTOS_DISPUTE_PAD_DAYS = 90

function monthsAgo(months: number): Date {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  return date
}

function yearsAgo(years: number): Date {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return date
}

/** Deletes messages older than the retention window. Conversations and
 *  bookings are untouched — only the message bodies themselves, which is all
 *  privacy.md §7 promises a retention limit on. */
export async function purgeOldMessages() {
  const before = monthsAgo(RETENTION_MESSAGES_MONTHS)
  const result = await prisma.message.deleteMany({
    where: { createdAt: { lt: before } },
  })
  return { deleted: result.count }
}

/** Deletes resolved/dismissed disputes and reviewed/dismissed reports past
 *  the 3-year retention window. An unresolved dispute (OPEN/UNDER_REVIEW) or
 *  an unreviewed report (OPEN) is never touched here regardless of age —
 *  those aren't "resolved N years ago" yet. Bookings are untouched; this only
 *  removes the Dispute/Report rows themselves. */
export async function purgeOldDisputesAndReports() {
  const before = yearsAgo(RETENTION_DISPUTES_REPORTS_YEARS)

  const disputes = await prisma.dispute.deleteMany({
    where: {
      resolvedAt: { lt: before },
      status: { in: [DisputeStatus.RESOLVED_REFUND, DisputeStatus.RESOLVED_NO_ACTION, DisputeStatus.DISMISSED] },
    },
  })

  const reports = await prisma.report.deleteMany({
    where: {
      reviewedAt: { lt: before },
      status: { in: ['REVIEWED', 'DISMISSED'] },
    },
  })

  return { disputesDeleted: disputes.count, reportsDeleted: reports.count }
}

/** Clears pickup/return photo URLs off old, fully-resolved bookings. The
 *  Booking row itself is kept indefinitely (it's also the 7-year tax/
 *  transaction record — see schema.prisma's ProcessedStripeEvent comment for
 *  the general pattern of not deleting financial rows); only the photo arrays
 *  are nulled out. A booking with any dispute still open or under review is
 *  skipped entirely, however old, since those photos may still be live
 *  evidence. */
export async function purgeOldHandoffPhotos() {
  const before = monthsAgo(RETENTION_HANDOFF_PHOTOS_MONTHS)
  const disputePad = new Date(Date.now() - RETENTION_HANDOFF_PHOTOS_DISPUTE_PAD_DAYS * 24 * 60 * 60 * 1000)

  const result = await prisma.booking.updateMany({
    where: {
      OR: [{ pickupPhotos: { isEmpty: false } }, { returnPhotos: { isEmpty: false } }],
      disputeStatus: { notIn: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
      AND: [
        {
          OR: [
            // No dispute was ever filed — the plain 12-month clock applies.
            { disputeStatus: DisputeStatus.NONE, completedAt: { lt: before } },
            // A dispute was filed and resolved — give it the resolution-date
            // + 90-day pad instead, in case resolution dragged past 12 months.
            { disputeStatus: { not: DisputeStatus.NONE }, updatedAt: { lt: disputePad } },
          ],
        },
      ],
    },
    data: { pickupPhotos: [], returnPhotos: [] },
  })

  return { cleared: result.count }
}
