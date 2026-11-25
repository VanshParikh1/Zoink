import { BookingEventType, BookingStatus, DepositStatus, DisputeStatus, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { cancelDepositPaymentIntent, cancelPaymentIntent, getPaymentIntentChargeId, getRentalAuthorizationAmount, toCents, transferPayout } from './paymentService'
import { endOfRentalDay, noShowDeadline, overdueDeadline } from '@zoink/shared'
import { excludingReviewerDemoBookings } from '../config/reviewerAccounts'
import { payDepositCompensation } from './disputeService'
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
//
// A booking that keeps failing the same way (a restricted account, every
// 15 minutes) is recorded and reported once, not on every run: the timeline
// and Sentry get a new entry only when the failure changes.
export async function recordJobFailure(bookingId: string, action: string, error: unknown) {
  const message = error instanceof Error ? loggableMessage(error) : String(loggableError(error))
  console.error(`[${action}] booking ${bookingId} failed:`, loggableError(error))
  try {
    const last = await prisma.bookingEvent.findFirst({
      where: { bookingId, type: BookingEventType.ERROR, metadata: { path: ['action'], equals: action } },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    })
    if ((last?.metadata as { message?: unknown } | null)?.message === message) return

    Sentry.captureException(error, { tags: { job: action, bookingId } })
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
// out (or the write after Stripe fails) once Stripe has succeeded, the next
// run repeats the call with the same idempotency key and gets the same result
// back. That only holds because every Stripe key a job uses is fixed per
// booking or per PaymentIntent, never the booking version, which other jobs
// and webhooks bump in between runs.
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
            insuranceFee: true,
            hstAmount: true,
            refundedAmountCents: true,
            stripeChargeId: true,
            stripePaymentIntentId: true,
            owner: { select: { stripeAccountId: true } },
          },
        })
        if (!booking) return 'skipped' as const

        // Same base as the refund ceiling (F-14): what the rent PaymentIntent
        // charged, incl. any HST, since refundedAmountCents is measured against it.
        const chargedCents = getRentalAuthorizationAmount(booking)
        const fullOwnerPayoutCents = toCents(booking.ownerPayout)
        const refundedToRenterCents = Math.min(Math.max(booking.refundedAmountCents, 0), chargedCents)

        // The owner's cut of what the renter actually kept paying, proportional to
        // their share of the original charge (so the platform eats its commission on
        // the refunded slice too, D-5). With refundedToRenterCents === 0 — the common
        // case — this is exactly fullOwnerPayoutCents.
        const remainingPayoutCents =
          chargedCents > 0
            ? Math.max(
                0,
                Math.round(((chargedCents - refundedToRenterCents) * fullOwnerPayoutCents) / chargedCents),
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

        // The rent's charge, so the transfer doesn't depend on the platform's
        // available balance. Normally recorded at pickup; read back from the
        // PaymentIntent for a booking that predates that. If even that fails,
        // the transfer goes out from the available balance, as it used to.
        const sourceChargeId =
          booking.stripeChargeId ??
          (booking.stripePaymentIntentId
            ? await getPaymentIntentChargeId(booking.stripePaymentIntentId).catch(() => null)
            : null)
        const transfer = await transferPayout(booking, booking.owner.stripeAccountId, remainingPayoutCents, sourceChargeId)
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
      // P1-1: a deposit charge an admin started (maybe captured already) is never released.
      depositCaptureCents: null,
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
          select: { depositStatus: true, disputeStatus: true, stripeDepositPaymentIntentId: true, depositCaptureCents: true },
        })
        if (
          current.depositStatus !== DepositStatus.AUTHORIZED ||
          current.depositCaptureCents !== null ||
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

const NO_SHOW_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.PICKUP_PENDING]

/** D-3: a paid booking not picked up by noShowDeadline (end of the start day,
 *  Toronto, + 12 h) is cancelled, both holds are released and no one is
 *  charged. Each booking is re-checked under its row lock, the one pickup
 *  (handoffService) and the other jobs take, so an overlapping run or a pickup
 *  completing at the same moment can't both act. Stripe keys come from the
 *  locked row (rent: the booking version read here; deposit: its PI), so a run
 *  whose commit is lost repeats the same calls. */
export async function cancelNoShows(now: Date = new Date()) {
  // The deadline is always at least 40 h after startDate (midnight UTC of the
  // start day); 36 h keeps the prefilter safe. The exact check is below.
  const candidates = await prisma.booking.findMany({
    where: {
      status: { in: NO_SHOW_STATUSES },
      startDate: { lte: new Date(now.getTime() - 36 * 60 * 60 * 1000) },
      ...excludingReviewerDemoBookings(),
    },
    select: { id: true },
  })

  let cancelled = 0
  let failed = 0
  for (const { id } of candidates) {
    try {
      const booking = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`
        const b = await tx.booking.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            version: true,
            status: true,
            startDate: true,
            paidAt: true,
            renterId: true,
            ownerId: true,
            stripePaymentIntentId: true,
            stripeDepositPaymentIntentId: true,
            depositStatus: true,
            listing: { select: { title: true } },
          },
        })
        const deadline = noShowDeadline(b.startDate)
        if (!NO_SHOW_STATUSES.includes(b.status) || !deadline || now < deadline) return null
        // Rent is captured only at pickup, which moves the booking to ACTIVE.
        // A captured rent here is a bug: leave it for a person, don't release.
        if (b.paidAt) throw new Error('No-show booking has a captured rent payment; not cancelled.')

        if (b.stripePaymentIntentId) await cancelPaymentIntent(b)
        const releaseDeposit = Boolean(b.stripeDepositPaymentIntentId) && b.depositStatus === DepositStatus.AUTHORIZED
        if (releaseDeposit) {
          await cancelDepositPaymentIntent({ id: b.id, stripeDepositPaymentIntentId: b.stripeDepositPaymentIntentId! })
        }

        await tx.booking.update({
          where: { id: b.id },
          data: {
            status: BookingStatus.CANCELLED,
            // Same as a cancellation by either party (bookingService): the
            // payment_intent.canceled webhook finishes the move.
            ...(b.stripePaymentIntentId ? { paymentStatus: PaymentStatus.REFUND_PENDING } : {}),
            ...(releaseDeposit ? { depositStatus: DepositStatus.RELEASED } : {}),
            version: { increment: 1 },
          },
        })
        await tx.bookingEvent.create({
          data: {
            bookingId: b.id,
            type: BookingEventType.STATUS_CHANGE,
            metadata: { from: b.status, to: BookingStatus.CANCELLED, reason: 'no_show', deadline: deadline.toISOString(), depositReleased: releaseDeposit },
          },
        })
        return b
      }, STRIPE_JOB_TX_OPTIONS)
      if (!booking) continue

      cancelled += 1
      const title = booking.listing.title
      void notifyUser({
        userId: booking.renterId,
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled',
        body: `Your rental of ${title} was cancelled because the pickup didn't happen. You weren't charged, and any holds on your card were released.`,
        data: { bookingId: booking.id },
      })
      void notifyUser({
        userId: booking.ownerId,
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled',
        body: `The rental of ${title} was cancelled because the pickup didn't happen by noon the day after it started.`,
        data: { bookingId: booking.id },
      })
    } catch (error) {
      failed += 1
      await recordJobFailure(id, 'cancel_no_show', error)
    }
  }

  return { checked: candidates.length, cancelled, failed }
}

const EXPIRABLE_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.ACCEPTED]

/** Requests that ran out of time: PENDING not answered, or ACCEPTED not paid,
 *  by the end of the start day (00:00 Toronto the next day; a same-day request
 *  gets the rest of the day). They become
 *  CANCELLED (reason "expired"), any rent PaymentIntent is cancelled, and both
 *  parties are told it expired. Written directly, not through
 *  transitionBookingStatus, so it counts toward nobody's cancellationCount.
 *  Re-checked under the booking lock Pay and Confirm take, so a Confirm at the
 *  same moment either lands first (and this skips it) or finds it cancelled. */
export async function expireUnconfirmedBookings(now: Date = new Date()) {
  // Both deadlines fall after startDate (midnight UTC); the exact one is checked below.
  const candidates = await prisma.booking.findMany({
    where: { status: { in: EXPIRABLE_STATUSES }, startDate: { lte: now }, ...excludingReviewerDemoBookings() },
    select: { id: true },
  })

  let expired = 0
  let failed = 0
  for (const { id } of candidates) {
    try {
      const booking = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`
        const b = await tx.booking.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            version: true,
            status: true,
            startDate: true,
            renterId: true,
            ownerId: true,
            stripePaymentIntentId: true,
            listing: { select: { title: true } },
          },
        })
        if (!EXPIRABLE_STATUSES.includes(b.status)) return null
        const deadline = endOfRentalDay(b.startDate)
        if (!deadline || now < deadline) return null

        // Already-cancelled counts as released (paymentService.cancelPaymentIntent).
        if (b.stripePaymentIntentId) await cancelPaymentIntent(b)
        await tx.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED, version: { increment: 1 } } })
        await tx.bookingEvent.create({
          data: {
            bookingId: id,
            type: BookingEventType.STATUS_CHANGE,
            metadata: { from: b.status, to: BookingStatus.CANCELLED, reason: 'expired', deadline: deadline.toISOString() },
          },
        })
        return b
      }, STRIPE_JOB_TX_OPTIONS)
      if (!booking) continue

      expired += 1
      const title = booking.listing.title
      const unanswered = booking.status === BookingStatus.PENDING
      void notifyUser({
        userId: booking.renterId,
        type: 'BOOKING_CANCELLED',
        title: 'Request expired',
        body: unanswered
          ? `Your request for ${title} expired because the owner didn't answer it by the end of its start day.`
          : `Your booking of ${title} expired because it wasn't paid by the end of its start day. You weren't charged.`,
        data: { bookingId: booking.id },
      })
      void notifyUser({
        userId: booking.ownerId,
        type: 'BOOKING_CANCELLED',
        title: 'Request expired',
        body: unanswered
          ? `The request for ${title} expired because it wasn't answered by the end of its start day.`
          : `The booking of ${title} expired because the renter didn't pay by the end of its start day.`,
        data: { bookingId: booking.id },
      })
    } catch (error) {
      failed += 1
      await recordJobFailure(id, 'expire_booking', error)
    }
  }

  return { checked: candidates.length, expired, failed }
}

const OVERDUE_STATUSES: BookingStatus[] = [BookingStatus.ACTIVE, BookingStatus.RETURN_PENDING]

/** D-1: flags rentals whose return isn't completed by overdueDeadline (end of
 *  the day after endDate, Toronto), once each: sets overdueAt (the admin
 *  overdue list), records a RENTAL_OVERDUE event and notifies both parties.
 *  The admin then closes it out (closeOutService). The version isn't bumped,
 *  so a return tap racing this isn't refused. */
export async function flagOverdueRentals(now: Date = new Date()) {
  // The deadline is always more than 48 h after endDate (midnight UTC).
  const candidates = await prisma.booking.findMany({
    where: { status: { in: OVERDUE_STATUSES }, overdueAt: null, endDate: { lte: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
    select: { id: true },
  })

  let flagged = 0
  let failed = 0
  for (const { id } of candidates) {
    try {
      const booking = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id} FOR UPDATE`
        const b = await tx.booking.findUniqueOrThrow({
          where: { id },
          select: { id: true, status: true, endDate: true, overdueAt: true, renterId: true, ownerId: true, listing: { select: { title: true } } },
        })
        const deadline = overdueDeadline(b.endDate)
        if (!OVERDUE_STATUSES.includes(b.status) || b.overdueAt || !deadline || now < deadline) return null
        await tx.booking.update({ where: { id }, data: { overdueAt: now } })
        await tx.bookingEvent.create({
          data: { bookingId: id, type: BookingEventType.RENTAL_OVERDUE, metadata: { status: b.status, deadline: deadline.toISOString() } },
        })
        return b
      }, STRIPE_JOB_TX_OPTIONS)
      if (!booking) continue

      flagged += 1
      const title = booking.listing.title
      void notifyUser({
        userId: booking.renterId,
        type: 'RENTAL_OVERDUE',
        title: 'Your rental is overdue',
        body: `${title} was due back by the end of the day after your rental ended. Please return it and start the return in the app.`,
        data: { bookingId: booking.id },
      })
      void notifyUser({
        userId: booking.ownerId,
        type: 'RENTAL_OVERDUE',
        title: 'Rental overdue',
        body: `The return of ${title} hasn't been completed. The Zoink team has been alerted and will follow up.`,
        data: { bookingId: booking.id },
      })
    } catch (error) {
      failed += 1
      await recordJobFailure(id, 'flag_overdue', error)
    }
  }

  return { checked: candidates.length, flagged, failed }
}

/** Retries the owner's deposit compensation where the transfer made after the
 *  capture didn't go through (Stripe refused it, the owner had no connected
 *  account yet, or the process died first). Only bookings whose deposit
 *  capture is linked to its charge (stripeDepositChargeId) are considered, so
 *  a compensation paid before that column existed is never sent again. The
 *  transfer key is the booking's (deposit-comp-<id>), the same every attempt
 *  used, and a transfer older than the key is found on Stripe first. */
export async function retryDepositCompensations() {
  const due = await prisma.booking.findMany({
    where: {
      depositStatus: DepositStatus.CAPTURED,
      stripeDepositChargeId: { not: null },
      stripeDepositTransferId: null,
      owner: { stripeAccountId: { not: null } },
    },
    select: { id: true },
  })

  let paid = 0
  let failed = 0
  for (const { id } of due) {
    try {
      if (await payDepositCompensation(id, null, { checkExisting: true })) paid += 1
      else failed += 1
    } catch (error) {
      failed += 1
      await recordJobFailure(id, 'retry_deposit_compensation', error)
    }
  }

  return { checked: due.length, paid, failed }
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
