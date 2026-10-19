import { BookingEventType, BookingStatus, DepositStatus, DisputeStatus, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { cancelDepositPaymentIntent, toCents, transferPayout } from './paymentService'
import { notifyUser } from './notificationService'
import { DEPOSIT_HOLD_HOURS, PAYOUT_HOLD_HOURS, ZOINK_TAP_WINDOW_MS } from '../config/bookingWindows'
import { deleteUnverifiedAccounts } from './unverifiedAccounts'
import { Sentry } from '../instrument'
import { loggableError, loggableMessage } from '../utils/sentryScrub'

// The payment jobs below walk many bookings and call Stripe for each. One
// booking failing (a restricted connected account, a PaymentIntent Stripe
// already canceled, a network blip) must not abort the run and strand every
// booking after it: record it, report it, and move on. The booking is left
// exactly as it was, so the next run retries it.
export async function recordJobFailure(bookingId: string, action: string, error: unknown) {
  const message = error instanceof Error ? loggableMessage(error) : String(loggableError(error))
  console.error(`[${action}] booking ${bookingId} failed:`, loggableError(error))
  Sentry.captureException(error, { tags: { job: action, bookingId } })
  try {
    await prisma.bookingEvent.create({
      data: { bookingId, type: BookingEventType.ERROR, metadata: { action, message } },
    })
  } catch (auditError) {
    console.error(`[${action}] could not record the failure for booking ${bookingId}:`, auditError)
  }
}

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

// The payment jobs call Stripe while holding the booking's row lock, so the
// transaction needs longer than Prisma's 5-second default. If it does time
// out after Stripe succeeded, the next run repeats the call with the same
// idempotency key and gets the same result back.
const STRIPE_JOB_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }

export async function releaseDuePayouts() {
  const holdHours = PAYOUT_HOLD_HOURS
  const dueBefore = new Date(Date.now() - holdHours * 60 * 60 * 1000)

  const dueWhere = {
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
        disputeStatus: { in: ['NONE', 'RESOLVED_NO_ACTION', 'DISMISSED', 'RESOLVED_REFUND'] as DisputeStatus[] },
      },
      // A dispute that refunded the renter the FULL charge leaves the booking
      // at REFUNDED. The owner is owed nothing, but it still needs closing out
      // (payoutSentAt) so this job stops looking at it.
      {
        paymentStatus: PaymentStatus.REFUNDED,
        disputeStatus: DisputeStatus.RESOLVED_REFUND,
      },
    ],
  }

  const bookings = await prisma.booking.findMany({ where: dueWhere, select: { id: true } })

  let paid = 0
  let failed = 0
  for (const { id } of bookings) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        // Re-read under the booking's row lock (the one createDispute takes)
        // so a dispute filed at the last moment, or an overlapping run of this
        // job, can't slip in between the eligibility check and the transfer.
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`
        const booking = await tx.booking.findFirst({
          where: { id, ...dueWhere },
          select: {
            id: true,
            version: true,
            ownerPayout: true,
            totalPrice: true,
            refundedAmountCents: true,
            owner: { select: { stripeAccountId: true } },
          },
        })
        if (!booking) return 'skipped' as const

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
          return 'closed' as const
        }

        if (!booking.owner.stripeAccountId) return 'skipped' as const

        const transfer = await transferPayout(booking, booking.owner.stripeAccountId, remainingPayoutCents)
        const isPartial = remainingPayoutCents !== fullOwnerPayoutCents
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
        return 'paid' as const
      }, STRIPE_JOB_TX_OPTIONS)
      if (outcome === 'paid') paid += 1
    } catch (error) {
      failed += 1
      await recordJobFailure(id, 'release_payout', error)
    }
  }

  return { checked: bookings.length, paid, failed }
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
  let failed = 0
  for (const booking of bookings) {
    const depositPaymentIntentId = booking.stripeDepositPaymentIntentId
    if (!depositPaymentIntentId) continue

    try {
      const didRelease = await prisma.$transaction(async (tx) => {
        // createDispute takes the same row lock: a dispute filed at the 24-hour
        // mark either commits first (and this re-check skips the booking) or
        // waits and then finds the deposit already released. Before, the job
        // could read "no dispute", the dispute could commit, and the deposit
        // was released anyway.
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`
        const current = await tx.booking.findUniqueOrThrow({
          where: { id: booking.id },
          select: { depositStatus: true, disputeStatus: true, stripeDepositPaymentIntentId: true },
        })
        if (
          current.depositStatus !== DepositStatus.AUTHORIZED ||
          current.disputeStatus === DisputeStatus.OPEN ||
          current.disputeStatus === DisputeStatus.UNDER_REVIEW ||
          current.stripeDepositPaymentIntentId !== depositPaymentIntentId
        ) {
          return false
        }

        await cancelDepositPaymentIntent({ id: booking.id, stripeDepositPaymentIntentId: depositPaymentIntentId })

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
        return true
      }, STRIPE_JOB_TX_OPTIONS)
      if (!didRelease) continue

      void notifyUser({
        userId: booking.renterId,
        type: 'DEPOSIT_RELEASED',
        title: 'Deposit released',
        body: `Your security deposit for ${booking.listing.title} has been released back to you.`,
        data: { bookingId: booking.id },
      })
      released += 1
    } catch (error) {
      failed += 1
      await recordJobFailure(booking.id, 'release_deposit', error)
    }
  }

  return { checked: bookings.length, released, failed }
}

// ── Retention sweeps (privacy.md §7) ─────────────────────────────────────────
// These make the retention table in privacy.md true rather than aspirational.
// Run on a slower cadence than the payment jobs above (see index.ts — daily is
// plenty; nothing here is time-critical the way a payout or deposit release
// is). Two things this file deliberately does NOT do, because they're outside
// what a DB sweep can safely touch:
//   - Error/diagnostic log retention (90 days) is a Sentry project setting,
//     not application code — set it in the Sentry dashboard.
//   - Listing deletion: a listing nobody messaged about or booked is deleted
//     at once (listingService.deleteListing). One with history is
//     soft-deleted (deletedAt, photos removed) and kept for its bookings and
//     chats; nothing here purges those rows yet. A purge would have to wait
//     until the listing's last booking and message are past their own
//     retention periods below.
// See legal/OPEN-ITEMS.md, section C ("Retention periods").

const RETENTION_MESSAGES_MONTHS = 24
// privacy.md §7: verification codes are "expired or deleted within 24 hours".
// Run with the 15-minute cleanup job (not the daily sweep) so no code outlives
// that by more than a quarter hour.
const RETENTION_VERIFICATION_TOKENS_HOURS = 24
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

/** Deletes email verification codes older than 24 hours, used or not —
 *  verifyOTP only ever reads the latest unused one, and they expire after
 *  OTP_EXPIRY_MINUTES anyway — and the record of which addresses were sent a
 *  code, which only the 24-hour send cap reads. */
export async function purgeOldVerificationTokens() {
  const before = new Date(Date.now() - RETENTION_VERIFICATION_TOKENS_HOURS * 60 * 60 * 1000)
  const result = await prisma.verificationToken.deleteMany({
    where: { createdAt: { lt: before } },
  })
  const sends = await prisma.verificationEmailSend.deleteMany({
    where: { createdAt: { lt: before } },
  })
  return { deleted: result.count, emailSendsDeleted: sends.count }
}

// An account that hasn't verified its email within a day of signing up is
// deleted (owner decision, 2026-10-18), freeing the address. Signing up again
// with the same email replaces it sooner (authService.registerUser).
const UNVERIFIED_ACCOUNT_HOURS = 24

/** Deletes accounts still unverified 24 hours after sign-up, with their codes,
 *  blocks and notifications. Never touches a verified, admin, soft-deleted or
 *  ever-active account (see unverifiedAccounts.ts). Idempotent: a repeat run,
 *  or two runs at once, deletes nothing more. */
export async function purgeUnverifiedAccounts() {
  const before = new Date(Date.now() - UNVERIFIED_ACCOUNT_HOURS * 60 * 60 * 1000)
  const deleted = await prisma.$transaction((tx) => deleteUnverifiedAccounts(tx, { createdAt: { lt: before } }))
  return { deleted }
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
