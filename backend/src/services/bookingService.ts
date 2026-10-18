import { BookingEventType, BookingStatus, DepositStatus, PaymentStatus, Prisma, ReviewRole } from '@prisma/client'
import { cancellationCutoff, quoteRental, type BookingResponse, type PendingReviewResponse, type UserSummary } from '@zoink/shared'
import prisma from '../utils/prisma'
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors'
import { assertBookingTransition } from '../middleware/bookingStateMachine'
import { ensureValidBookingDates, getRentalDays } from './bookingUtils'
import { hasConflict, sortByStart, toDayInterval } from './intervalScheduling'
import { notifyUser } from './notificationService'
import { assertNotBlocked } from './blockService'
import {
  calculateCommission,
  calculateHst,
  calculateInsuranceFee,
  calculateOwnerPayout,
  cancelDepositPaymentIntent,
  cancelPaymentIntent,
  capturePaymentIntent,
  createDepositPaymentIntent,
  createPaymentIntent,
  getConnectAccountStatus,
  getMockAuthorizedPaymentStatus,
  getOrCreateStripeCustomer,
  getPaymentIntentPaymentMethod,
  getRentalAuthorizationAmount,
  retrievePaymentIntent,
  toCents,
  toDecimal,
} from './paymentService'
import { scoreLabelsForRole } from './reviewService'
import { Sentry } from '../instrument'

const bookingSelect = {
  id: true,
  status: true,
  version: true,
  startDate: true,
  endDate: true,
  totalPrice: true,
  paymentStatus: true,
  depositAmount: true,
  commissionAmount: true,
  ownerPayout: true,
  insuranceOptIn: true,
  insuranceFee: true,
  hstAmount: true,
  stripePaymentIntentId: true,
  stripeDepositPaymentIntentId: true,
  depositStatus: true,
  stripeChargeId: true,
  stripeTransferId: true,
  refundedAt: true,
  paidAt: true,
  payoutSentAt: true,
  pickupPhotos: true,
  returnPhotos: true,
  handoffInitiatedAt: true,
  returnInitiatedAt: true,
  ownerPickupTappedAt: true,
  renterPickupTappedAt: true,
  ownerReturnTappedAt: true,
  renterReturnTappedAt: true,
  disputeStatus: true,
  disputedAt: true,
  disputeReason: true,
  renterId: true,
  ownerId: true,
  listingId: true,
  conversationId: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      category: true,
      dailyPrice: true,
      itemValue: true,
      city: true,
      address: true,
      isAvailable: true,
      images: {
        select: { id: true, url: true, order: true },
        orderBy: { order: 'asc' as const },
      },
    },
  },
  renter: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
      stripeCustomerId: true,
    },
  },
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
  reviewObligations: {
    select: {
      id: true,
      userId: true,
      targetUserId: true,
      reviewerRole: true,
      status: true,
      submittedReviewId: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.BookingSelect

// A previous Pay attempt's PaymentIntent in one of these states has not been
// authorized yet, so handing its client secret back is equivalent to a fresh one.
const REUSABLE_PAYMENT_INTENT_STATUSES = ['requires_payment_method', 'requires_confirmation']

// List endpoints (GET /bookings/me, /bookings/requests). They never touch the
// renter's email / Stripe customer id (only the payment paths read those, and
// they load bookingSelect), and toBookingResponse strips them anyway.
const bookingListSelect = {
  ...bookingSelect,
  // Every list screen renders only the thumbnail (images[0]); detail screens
  // re-fetch the booking and get the full gallery.
  listing: {
    select: {
      ...bookingSelect.listing.select,
      images: { ...bookingSelect.listing.select.images, take: 1 },
    },
  },
  renter: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
} satisfies Prisma.BookingSelect

export type CreateBookingInput = {
  listingId: string
  startDate: Date
  endDate: Date
  message?: string
}

function toUserSummary(user: any): UserSummary {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    verificationStatus: user.verificationStatus,
  }
}

function mapPendingReviewForUser(booking: any, userId?: string): PendingReviewResponse | null {
  if (!userId || !Array.isArray(booking.reviewObligations)) {
    return null
  }

  const obligation = booking.reviewObligations.find((item: any) => item.userId === userId && item.status === 'PENDING')
  if (!obligation) {
    return null
  }

  const reviewee = obligation.targetUserId === booking.ownerId ? booking.owner : booking.renter

  return {
    id: obligation.id,
    bookingId: booking.id,
    reviewerRole: obligation.reviewerRole,
    status: obligation.status,
    scoreLabels: scoreLabelsForRole(obligation.reviewerRole),
    createdAt: obligation.createdAt,
    reviewee: toUserSummary(reviewee),
    booking: {
      id: booking.id,
      startDate: booking.startDate,
      endDate: booking.endDate,
      completedAt: booking.completedAt,
      listing: booking.listing,
    },
  }
}

// A renter gets the listing's street address once their booking is paid
// (CONFIRMED) and through the rest of the rental; the owner always does.
const ADDRESS_VISIBLE_TO_RENTER: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PICKUP_PENDING,
  BookingStatus.ACTIVE,
  BookingStatus.RETURN_PENDING,
  BookingStatus.COMPLETED,
]

function listingForViewer(booking: any, userId?: string) {
  if (!booking.listing) return booking.listing
  const canSeeAddress =
    userId !== undefined &&
    (userId === booking.ownerId || (userId === booking.renterId && ADDRESS_VISIBLE_TO_RENTER.includes(booking.status)))
  return canSeeAddress ? booking.listing : { ...booking.listing, address: null }
}

function toBookingResponse(rawBooking: any, userId?: string): BookingResponse {
  const booking = { ...rawBooking, listing: listingForViewer(rawBooking, userId) }
  const totalPrice = Number(booking.totalPrice)
  return {
    id: booking.id,
    status: booking.status,
    version: booking.version,
    startDate: booking.startDate,
    endDate: booking.endDate,
    totalPrice,
    paymentStatus: booking.paymentStatus,
    depositAmount: Number(booking.depositAmount),
    commissionAmount: Number(booking.commissionAmount ?? calculateCommission(totalPrice, booking.listing?.dailyPrice ?? 0)),
    ownerPayout: Number(booking.ownerPayout ?? calculateOwnerPayout(totalPrice, booking.listing?.dailyPrice ?? 0)),
    insuranceOptIn: booking.insuranceOptIn,
    insuranceFee: Number(booking.insuranceFee ?? 0),
    hstAmount: Number(booking.hstAmount ?? calculateHst(totalPrice)),
    stripePaymentIntentId: booking.stripePaymentIntentId,
    stripeDepositPaymentIntentId: booking.stripeDepositPaymentIntentId ?? null,
    depositStatus: booking.depositStatus ?? null,
    stripeChargeId: booking.stripeChargeId,
    stripeTransferId: booking.stripeTransferId,
    paidAt: booking.paidAt,
    refundedAt: booking.refundedAt,
    payoutSentAt: booking.payoutSentAt,
    pickupPhotos: booking.pickupPhotos,
    returnPhotos: booking.returnPhotos,
    handoffInitiatedAt: booking.handoffInitiatedAt,
    returnInitiatedAt: booking.returnInitiatedAt,
    ownerPickupTappedAt: booking.ownerPickupTappedAt,
    renterPickupTappedAt: booking.renterPickupTappedAt,
    ownerReturnTappedAt: booking.ownerReturnTappedAt,
    renterReturnTappedAt: booking.renterReturnTappedAt,
    disputeStatus: booking.disputeStatus,
    disputedAt: booking.disputedAt,
    disputeReason: booking.disputeReason,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
    listingId: booking.listingId,
    conversationId: booking.conversationId,
    completedAt: booking.completedAt,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    listing: booking.listing,
    renter: toUserSummary(booking.renter),
    owner: toUserSummary(booking.owner),
    reviewObligations: booking.reviewObligations,
    pendingReview: mapPendingReviewForUser(booking, userId),
  }
}

async function createBookingEvent(
  tx: Prisma.TransactionClient,
  bookingId: string,
  actorId: string | null,
  type: BookingEventType,
  metadata?: Prisma.InputJsonValue
) {
  await tx.bookingEvent.create({
    data: {
      bookingId,
      actorId,
      type,
      metadata: metadata ?? Prisma.JsonNull,
    },
  })
}

async function getBookingForParticipant(bookingId: string, userId: string) {
  const booking: any = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) {
    throw new NotFoundError('Booking not found.')
  }

  if (booking.renterId !== userId && booking.ownerId !== userId) {
    throw new ForbiddenError('You do not have access to this booking.')
  }

  return booking
}

async function createReviewObligationsForCompletedBooking(tx: Prisma.TransactionClient, booking: { id: string; renterId: string; ownerId: string }) {
  await tx.reviewObligation.createMany({
    data: [
      {
        bookingId: booking.id,
        userId: booking.renterId,
        targetUserId: booking.ownerId,
        reviewerRole: ReviewRole.RENTER,
      },
      {
        bookingId: booking.id,
        userId: booking.ownerId,
        targetUserId: booking.renterId,
        reviewerRole: ReviewRole.LENDER,
      },
    ],
    skipDuplicates: true,
  })
}

// A booking holds its dates from payment (CONFIRMED) until the item is back.
// PICKUP_PENDING and RETURN_PENDING were missing here, so a second renter could
// pay for dates that were mid-handoff. ACCEPTED-but-unpaid requests still
// deliberately don't reserve dates.
const DATE_HOLDING_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.PICKUP_PENDING,
  BookingStatus.ACTIVE,
  BookingStatus.RETURN_PENDING,
]

/** The requested dates are already held by another paid booking. */
class DatesUnavailableError extends ConflictError {
  constructor() {
    super('Those dates overlap with another accepted booking.')
  }
}

type Db = Prisma.TransactionClient | typeof prisma

/** Takes a row lock on the listing for the rest of the transaction. Accepting
 *  and confirming both read the listing's other bookings and then write; with
 *  the lock, two of them on one listing run one after the other instead of
 *  both passing the overlap check before either commits (two renters paying
 *  for the same dates, or one accept overwriting another's auto-decline). */
async function lockListing(tx: Prisma.TransactionClient, listingId: string) {
  await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`
}

async function ensureNoOverlap(listingId: string, bookingId: string, db: Db = prisma) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, startDate: true, endDate: true },
  })

  if (!booking) {
    throw new NotFoundError('Booking not found.')
  }

  // Fetch this listing's date-holding bookings and test the candidate against
  // them as sorted, inclusive integer-day intervals. The DB just returns the
  // listing's small active set — served straight from @@index([listingId,
  // status]) rather than a sequential scan — and interval scheduling does the
  // O(log n) conflict check in memory. The 409 body is unchanged so every
  // caller (and the tests pinning it) keeps working.
  const activeBookings = await db.booking.findMany({
    where: {
      listingId,
      id: { not: bookingId },
      status: { in: DATE_HOLDING_STATUSES },
    },
    select: { id: true, startDate: true, endDate: true },
  })

  const sortedIntervals = sortByStart(
    activeBookings.map((b) => toDayInterval(b.startDate, b.endDate, b.id))
  )
  const candidate = toDayInterval(booking.startDate, booking.endDate, booking.id)

  if (hasConflict(sortedIntervals, candidate)) {
    throw new DatesUnavailableError()
  }
}

export async function createBooking(renterId: string, input: CreateBookingInput): Promise<BookingResponse> {
  ensureValidBookingDates(input.startDate, input.endDate)

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true,
      ownerId: true,
      isAvailable: true,
      dailyPrice: true,
      itemValue: true,
      depositAmount: true,
      owner: {
        select: { id: true, stripeAccountId: true },
      },
    },
  })

  if (!listing) {
    throw new NotFoundError('Listing not found.')
  }

  if (listing.ownerId === renterId) {
    throw new BadRequestError('You cannot book your own listing.')
  }

  await assertNotBlocked(renterId, listing.ownerId)

  if (!listing.isAvailable) {
    throw new BadRequestError('This listing is currently unavailable.')
  }

  const rentalDays = getRentalDays(input.startDate, input.endDate)

  if (rentalDays <= 0) {
    throw new BadRequestError('Start and end dates are invalid.')
  }

  // The same quote the request screen previews (@zoink/shared quoteRental).
  const { totalPrice, depositAmount, commissionAmount, ownerPayout, hstAmount } = quoteRental(
    Number(listing.dailyPrice),
    rentalDays,
    Number(listing.depositAmount)
  )
  // Zoink offers no insurance product at launch (terms.md §12) — insuranceOptIn
  // is never read from client input (CreateBookingSchema doesn't even accept
  // it, see booking.schema.ts). Hardcoded false here rather than trusting a
  // default keeps this true even if a caller bypasses validation, and the
  // assertion below is a second, independent guard against the fee ever being
  // nonzero. See legal/OPEN-ITEMS.md B1.
  const insuranceOptIn = false
  const insuranceFee = calculateInsuranceFee(listing.itemValue, insuranceOptIn)
  if (insuranceFee !== 0) {
    throw new Error('INSURANCE_FEE_MUST_BE_ZERO: Zoink offers no insurance product at launch.')
  }

  const trimmedMessage = input.message?.trim() || null

  const booking: any = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: {
        listingId_renterId: {
          listingId: listing.id,
          renterId,
        },
      },
      update: {},
      create: {
        listingId: listing.id,
        renterId,
        ownerId: listing.ownerId,
      },
      select: { id: true },
    })

    const created: any = await tx.booking.create({
      data: {
        listingId: listing.id,
        renterId,
        ownerId: listing.ownerId,
        conversationId: conversation.id,
        startDate: input.startDate,
        endDate: input.endDate,
        totalPrice: toDecimal(totalPrice),
        depositAmount: toDecimal(depositAmount),
        commissionAmount: toDecimal(commissionAmount),
        ownerPayout: toDecimal(ownerPayout),
        insuranceOptIn,
        insuranceFee: toDecimal(insuranceFee),
        hstAmount: toDecimal(hstAmount),
      } as any,
      select: bookingSelect as any,
    })

    await createBookingEvent(tx, created.id, renterId, BookingEventType.STATUS_CHANGE, {
      status: created.status,
    })

    if (trimmedMessage) {
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: renterId,
          body: trimmedMessage,
        },
      })
    }

    return created
  })

  void notifyUser({
    userId: listing.ownerId,
    type: 'BOOKING_REQUEST',
    title: 'New booking request',
    body: 'A renter requested dates for one of your listings.',
    data: { bookingId: booking.id, listingId: listing.id },
  })

  return toBookingResponse(booking)
}

// Pay and Confirm call Stripe and then write the booking, so they hold the
// booking's row lock across both and run one at a time per booking: a second
// tap (or a Pay racing an in-flight Confirm) waits and then acts on what the
// first one did, instead of on a stale read. Before this, two confirms raced
// on the same deposit idempotency key; Stripe rejects the second while the
// first is in flight, and that failure path then cancelled the rent
// authorization the first confirm was using.
const STRIPE_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 }

async function withBookingLock<T>(bookingId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    return work(tx)
  }, STRIPE_TX_OPTIONS)
}

async function readBookingForParticipant(db: Db, bookingId: string, userId: string) {
  const booking: any = await db.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) {
    throw new NotFoundError('Booking not found.')
  }

  if (booking.renterId !== userId && booking.ownerId !== userId) {
    throw new ForbiddenError('You do not have access to this booking.')
  }

  return booking
}

export async function createPaymentIntentForBooking(bookingId: string, renterId: string): Promise<BookingResponse> {
  return withBookingLock(bookingId, async (tx) => {
    const booking = await readBookingForParticipant(tx, bookingId, renterId)

    if (booking.renterId !== renterId) {
      throw new ForbiddenError('You do not have access to this booking.')
    }

    if (booking.status !== 'ACCEPTED') {
      throw new ConflictError('This booking is not ready for payment.')
    }

    // Every Pay tap used to mint a fresh PaymentIntent, leaving the previous
    // attempt's authorization (if the renter got that far) held on their card
    // for ~7 days. Reuse the previous PaymentIntent when it hasn't been paid yet
    // and still matches this booking's amount; otherwise retire it before a new
    // one is created. Its payment_intent.canceled webhook is harmless: once the
    // new PaymentIntent is installed below it is ignored as superseded, and if
    // it lands first, the update below resets paymentStatus/refundedAt anyway.
    if (booking.stripePaymentIntentId) {
      const previous = await retrievePaymentIntent(booking.stripePaymentIntentId)

      if (previous) {
        const reusable =
          REUSABLE_PAYMENT_INTENT_STATUSES.includes(previous.status) &&
          previous.amount === getRentalAuthorizationAmount(booking) &&
          previous.currency === (process.env.STRIPE_CURRENCY ?? 'cad') &&
          previous.metadata?.bookingId === booking.id

        if (reusable) {
          await tx.bookingEvent.create({
            data: {
              bookingId: booking.id,
              actorId: renterId,
              type: BookingEventType.PAYMENT_INTENT_CREATED,
              metadata: { paymentIntentId: previous.id, status: previous.status, reused: true },
            },
          })

          return {
            ...toBookingResponse(booking, renterId),
            paymentClientSecret: previous.client_secret ?? null,
          }
        }

        if (previous.status === 'succeeded') {
          // A captured rental payment on an ACCEPTED booking should be
          // impossible (capture only happens at pickup); never charge twice.
          throw new ConflictError('This booking has already been paid.')
        }

        if (previous.status !== 'canceled') {
          try {
            await cancelPaymentIntent(booking)
          } catch {
            // e.g. still `processing` — Stripe refuses to cancel it. Don't mint a
            // second PaymentIntent next to one that may yet go through.
            throw new ConflictError('Your previous payment attempt is still being processed. Please try again in a moment.')
          }
        }
      }
    }

    // A real Stripe Customer is required so the payment method attached here
    // can be saved (setup_future_usage) and reused off-session for the
    // deposit PaymentIntent once this one is confirmed (see
    // confirmBookingPayment below).
    const stripeCustomerId = await getOrCreateStripeCustomer(
      booking.renter.id,
      booking.renter.email,
      booking.renter.stripeCustomerId
    )
    const paymentIntent = await createPaymentIntent(booking, stripeCustomerId)
    const paymentStatus = getMockAuthorizedPaymentStatus()

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus,
        // Nothing has been paid before the first confirmed PaymentIntent, so a
        // refundedAt here can only be a stale stamp from a retired attempt.
        refundedAt: null,
        version: { increment: 1 },
      },
    })

    await createBookingEvent(tx, booking.id, renterId, BookingEventType.PAYMENT_INTENT_CREATED, {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      paymentStatus,
    })

    const updated = await tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: bookingSelect as any,
    })

    return {
      ...toBookingResponse(updated, renterId),
      paymentClientSecret: paymentIntent.client_secret ?? null,
    }
  })
}

/**
 * ACCEPTED -> CONFIRMED: the renter has authorized the rent, so authorize the
 * deposit and lock the dates. Runs under the booking's row lock (see
 * withBookingLock) and the listing's (see lockListing), so a double tap
 * returns the first confirm's result and two renters can't both confirm the
 * same dates.
 */
async function confirmBookingPayment(bookingId: string, actorId: string): Promise<BookingResponse> {
  let rentalToRelease: any = null
  let depositPaymentIntentId: string | null = null
  let alreadyConfirmed = false

  try {
    const confirmed: any = await withBookingLock(bookingId, async (tx) => {
      const booking = await readBookingForParticipant(tx, bookingId, actorId)

      if (booking.renterId !== actorId) {
        throw new ForbiddenError('You do not have access to this booking.')
      }

      // A repeated confirm (double tap, retry after a dropped response) finds
      // the first one's work done.
      if (booking.status === BookingStatus.CONFIRMED && booking.stripeDepositPaymentIntentId) {
        alreadyConfirmed = true
        return booking
      }

      assertBookingTransition(booking.status, BookingStatus.CONFIRMED)

      // This is the new payment checkpoint — dates only truly lock once payment
      // is authorized, which is why the overlap check runs here: two different
      // ACCEPTED-but-unpaid requests can overlap (accepting doesn't block on
      // other ACCEPTED bookings), so the second one to reach this step must be
      // rejected if the first already confirmed. The renter has just
      // authorized the rent for dates they can no longer have, so that hold is
      // released rather than left on their card for days.
      await lockListing(tx, booking.listingId)
      try {
        await ensureNoOverlap(booking.listingId, booking.id, tx)
      } catch (error) {
        if (error instanceof DatesUnavailableError) rentalToRelease = booking
        throw error
      }

      if (booking.paymentStatus !== PaymentStatus.AUTHORIZED && booking.paymentStatus !== PaymentStatus.CAPTURED) {
        throw new ConflictError('Payment authorization is not ready yet.')
      }

      if (!booking.stripePaymentIntentId) {
        throw new ConflictError('Payment authorization is not ready yet.')
      }

      // The deposit is authorized as its own PaymentIntent, off-session, reusing
      // the payment method the borrower just attached while confirming the
      // rental PaymentIntent (see createPaymentIntent's setup_future_usage).
      // This keeps it held through the full rental — resolved later at return
      // handoff, not released as a side effect of the rental capture at pickup.
      //
      // If authorization fails here, the booking must NOT become CONFIRMED: the
      // rental PaymentIntent is still just an uncaptured hold, so it's safe to
      // cancel it and surface a clear error, leaving the booking exactly where
      // it was (ACCEPTED) so the borrower can retry payment from scratch. A
      // booking must never end up CONFIRMED with only the rental portion
      // secured and no deposit hold in place.
      try {
        const stripeCustomerId = await getOrCreateStripeCustomer(
          booking.renter.id,
          booking.renter.email,
          booking.renter.stripeCustomerId
        )
        const paymentMethodId = await getPaymentIntentPaymentMethod(booking.stripePaymentIntentId)

        if (!stripeCustomerId || !paymentMethodId) {
          throw new Error('No saved payment method is available to authorize the deposit.')
        }

        const depositIntent = await createDepositPaymentIntent(booking, stripeCustomerId, paymentMethodId)
        depositPaymentIntentId = depositIntent.id
      } catch (error) {
        rentalToRelease = booking
        throw new ConflictError(
          `Could not authorize the deposit — payment was not completed: ${error instanceof Error ? error.message : 'UNKNOWN_ERROR'}. Please try again.`
        )
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.CONFIRMED,
          stripeDepositPaymentIntentId: depositPaymentIntentId,
          depositStatus: DepositStatus.AUTHORIZED,
          version: { increment: 1 },
        },
      })

      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, { from: booking.status, to: BookingStatus.CONFIRMED })
      await createBookingEvent(tx, booking.id, actorId, BookingEventType.PAYMENT_INTENT_CREATED, {
        paymentIntentId: depositPaymentIntentId,
        purpose: 'deposit',
      })

      return tx.booking.findUniqueOrThrow({ where: { id: booking.id }, select: bookingSelect as any })
    })

    if (!alreadyConfirmed) {
      void notifyUser({
        userId: confirmed.ownerId,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment received',
        body: `${confirmed.listing.title} is booked and paid for — you can start the handoff.`,
        data: { bookingId: confirmed.id, listingId: confirmed.listingId },
      })
    }

    return toBookingResponse(confirmed, actorId)
  } catch (error) {
    // Nothing committed: release whatever this attempt left authorized. The
    // deposit is only released if the booking doesn't hold it (a commit that
    // reported failure after landing would still hold it).
    if (depositPaymentIntentId) {
      const current = await prisma.booking.findUnique({ where: { id: bookingId }, select: { stripeDepositPaymentIntentId: true } })
      if (current?.stripeDepositPaymentIntentId !== depositPaymentIntentId) {
        await releaseDepositHold(bookingId, depositPaymentIntentId, actorId, 'confirm_failed')
        rentalToRelease ??= await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, version: true, stripePaymentIntentId: true } })
      }
    }
    if (rentalToRelease) await releaseRentalAuthorization(rentalToRelease, actorId)
    throw error
  }
}

export async function getBookingById(bookingId: string, userId: string): Promise<BookingResponse> {
  const booking = await getBookingForParticipant(bookingId, userId)
  return toBookingResponse(booking, userId)
}

export async function getMyBookings(renterId: string): Promise<BookingResponse[]> {
  const bookings: any[] = await prisma.booking.findMany({
    where: { renterId },
    select: bookingListSelect,
    // Most-recent-activity ordering: updatedAt bumps on every status
    // transition (PENDING -> ACCEPTED -> ... -> COMPLETED/CANCELLED/DECLINED),
    // so a booking that was recently completed or cancelled surfaces near the
    // top instead of sinking based on when it was originally requested.
    orderBy: { updatedAt: 'desc' },
  })

  return bookings.map((booking: any) => toBookingResponse(booking, renterId))
}

export async function getIncomingRequests(ownerId: string): Promise<BookingResponse[]> {
  const bookings: any[] = await prisma.booking.findMany({
    where: { ownerId },
    select: bookingListSelect,
    // status:'asc' keeps PENDING requests (needing the owner's action) pinned
    // above everything else — that's a deliberate actionable-items-first
    // priority, independent of the "most recent activity" fix below, and
    // sorts by the BookingStatus enum's *declaration* order in schema.prisma
    // (PENDING is declared first), not alphabetically. Within each status
    // group, sort by updatedAt (most recent activity) rather than createdAt,
    // so e.g. the most recently completed booking leads the COMPLETED group
    // instead of the one requested longest ago.
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  })

  return bookings.map((booking: any) => toBookingResponse(booking, ownerId))
}

/** The moves a client can ask for directly. ACTIVE and COMPLETED only happen
 *  through the handoff (handoffService.confirmHandoff), which captures the rent
 *  and records both taps; there's no route that skips it. */
export type DirectBookingTransition = 'ACCEPTED' | 'DECLINED' | 'CONFIRMED' | 'CANCELLED'

export async function transitionBookingStatus(bookingId: string, actorId: string, nextStatus: DirectBookingTransition): Promise<BookingResponse> {
  if (nextStatus === BookingStatus.CONFIRMED) {
    return confirmBookingPayment(bookingId, actorId)
  }

  const booking: any = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) {
    throw new NotFoundError('Booking not found.')
  }

  const isOwner = booking.ownerId === actorId
  const isRenter = booking.renterId === actorId

  if (!isOwner && !isRenter) {
    throw new ForbiddenError('You do not have access to this booking.')
  }

  if (nextStatus === 'ACCEPTED' || nextStatus === 'DECLINED') {
    if (!isOwner) {
      throw new ForbiddenError('You do not have access to this booking.')
    }
  }

  if (nextStatus === 'CANCELLED' && !isOwner && !isRenter) {
    throw new ForbiddenError('You do not have access to this booking.')
  }

  // terms.md §9: "Once the rental start time has passed, the booking is no
  // longer cancellable." The state machine alone doesn't enforce this — e.g.
  // CONFIRMED and PICKUP_PENDING both still allow a CANCELLED transition
  // structurally — so it needs an explicit date check here, independent of
  // status. See legal/OPEN-ITEMS.md B7. The start time is 00:00 Toronto on the
  // rental day; startDate itself (midnight UTC) is 7-8 PM the evening before.
  const cutoff = cancellationCutoff(booking.startDate) ?? booking.startDate
  if (nextStatus === 'CANCELLED' && new Date() >= cutoff) {
    throw new ConflictError('Once the rental start time has passed, this booking can no longer be cancelled.')
  }

  assertBookingTransition(booking.status, nextStatus)

  if (nextStatus === 'ACCEPTED') {
    // Only CONFIRMED/ACTIVE bookings hold dates now — ACCEPTED no longer implies
    // payment, so this just rejects accepting into dates someone has already paid
    // for. The payment-authorization precondition moves to the ACCEPTED ->
    // CONFIRMED transition, since payment happens after acceptance now.
    await ensureNoOverlap(booking.listingId, booking.id)
    const stripeAccountId = await ensureOwnerStripeAccount(booking.ownerId)
    if (!stripeAccountId) {
      throw new ConflictError('The owner needs to connect Stripe before accepting bookings.')
    }
  }

  const { updated, autoRejected } = await prisma.$transaction(async (tx) => {
    if (nextStatus === 'ACCEPTED') {
      await lockListing(tx, booking.listingId)
      await ensureNoOverlap(booking.listingId, booking.id, tx)
    }

    const result = await tx.booking.updateMany({
      where: { id: booking.id, version: booking.version },
      data: {
        status: nextStatus,
        version: { increment: 1 },
      },
    })

    if (result.count !== 1) {
      throw new ConflictError('This booking was updated by someone else. Please refresh and try again.')
    }

    const eventMetadata: Record<string, string> = { from: booking.status, to: nextStatus }
    if (nextStatus === 'DECLINED') {
      eventMetadata.reason = 'manual_decline'
    }
    await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, eventMetadata)

    // Accepting one request reserves the dates for it, so any other still-
    // PENDING request on the same listing that overlaps those dates can no
    // longer be honored — auto-decline it rather than leaving it to fail
    // later when someone tries to accept it. These do NOT revive if the
    // just-accepted booking is later cancelled (see handleCancellationPayment).
    const autoRejected: { id: string; renterId: string }[] = []
    if (nextStatus === 'ACCEPTED') {
      const overlapping = await tx.booking.findMany({
        where: {
          listingId: booking.listingId,
          id: { not: booking.id },
          status: 'PENDING',
          startDate: { lte: booking.endDate },
          endDate: { gte: booking.startDate },
        },
        select: { id: true, renterId: true },
      })

      // Each one is declined only if it is still PENDING: one the renter
      // just cancelled (or another accept already moved) is left alone
      // instead of being overwritten with an illegal ->DECLINED transition.
      for (const candidate of overlapping) {
        const declined = await tx.booking.updateMany({
          where: { id: candidate.id, status: 'PENDING' },
          data: { status: 'DECLINED', version: { increment: 1 } },
        })
        if (declined.count === 1) autoRejected.push(candidate)
      }

      if (autoRejected.length > 0) {
        await tx.bookingEvent.createMany({
          data: autoRejected.map((rejected) => ({
            bookingId: rejected.id,
            actorId,
            type: BookingEventType.STATUS_CHANGE,
            metadata: { from: 'PENDING', to: 'DECLINED', reason: 'overlap_auto_reject' },
          })),
        })
      }
    }

    const updated = await tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: bookingSelect as any,
    })

    return { updated, autoRejected }
  })

  if (nextStatus === 'CANCELLED') {
    await handleCancellationPayment(booking, actorId)
    // Zoink can't charge a cancellation fee (terms.md §9), so a per-user
    // count is the only signal available for the suspension right in §15
    // against someone who cancels repeatedly. Attributed to whichever party
    // actually triggered this transition. See legal/OPEN-ITEMS.md B7.
    await prisma.user.update({
      where: { id: actorId },
      data: { cancellationCount: { increment: 1 } },
    }).catch((error) => {
      console.error('[transitionBookingStatus] Failed to increment cancellationCount for user', actorId, error)
    })
  }

  if (nextStatus === 'ACCEPTED') {
    void notifyUser({
      userId: booking.renterId,
      type: 'BOOKING_ACCEPTED',
      title: 'Booking accepted',
      body: `${booking.listing.title} was approved by the owner.`,
      data: { bookingId: booking.id, listingId: booking.listingId },
    })

    for (const rejected of autoRejected) {
      void notifyUser({
        userId: rejected.renterId,
        type: 'BOOKING_DECLINED',
        title: 'Booking declined',
        body: `${booking.listing.title} was booked for those dates by another renter.`,
        data: { bookingId: rejected.id, listingId: booking.listingId },
      })
    }
  }

  if (nextStatus === 'DECLINED') {
    void notifyUser({
      userId: booking.renterId,
      type: 'BOOKING_DECLINED',
      title: 'Booking declined',
      body: `${booking.listing.title} was declined.`,
      data: { bookingId: booking.id, listingId: booking.listingId },
    })
  }

  if (nextStatus === 'CANCELLED') {
    const recipientId = isOwner ? booking.renterId : booking.ownerId
    void notifyUser({
      userId: recipientId,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      body: `${booking.listing.title} is no longer scheduled for those dates.`,
      data: { bookingId: booking.id, listingId: booking.listingId },
    })
  }

  return toBookingResponse(updated, actorId)
}

async function ensureOwnerStripeAccount(ownerId: string) {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { stripeAccountId: true },
  })

  if (owner?.stripeAccountId) {
    const status = await getConnectAccountStatus(owner.stripeAccountId)
    return status.payoutsEnabled ? owner.stripeAccountId : null
  }

  const devAccountId = process.env.DEV_STRIPE_ACCOUNT_ID
  if (!devAccountId || process.env.NODE_ENV === 'production') {
    return null
  }

  await prisma.user.update({
    where: { id: ownerId },
    data: { stripeAccountId: devAccountId },
  })

  return devAccountId
}

function calculateCancellationFeeCents(totalPrice: Prisma.Decimal | number) {
  // Cancellation fees disabled for launch (product decision — no fee by default).
  // Tiered fee calculation below is retained for a planned future feature:
  // an owner-toggleable "cancellation fee" option, following the same pattern
  // as Listing.insuranceOptIn. Do not delete this logic.
  return 0
  // --- retained tiered logic, currently unreachable, for future opt-in feature ---
  const fee = Math.min(25, Math.max(5, Number(totalPrice) * 0.05))
  return toCents(fee)
}

async function recordPaymentError(bookingId: string, actorId: string | null, action: string, error: unknown) {
  console.error(`[${action}] booking ${bookingId} failed:`, error)
  Sentry.captureException(error, { tags: { action, bookingId } })
  try {
    await prisma.bookingEvent.create({
      data: {
        bookingId,
        actorId,
        type: BookingEventType.ERROR,
        metadata: { action, message: error instanceof Error ? error.message : 'UNKNOWN_ERROR' },
      },
    })
  } catch (auditError) {
    console.error(`[${action}] could not record the failure for booking ${bookingId}:`, auditError)
  }
}

/** Releases a booking's deposit hold and records it. Never throws: a failure
 *  is recorded (and reported) for follow-up, since every caller has already
 *  committed the state change that made the hold unnecessary. */
async function releaseDepositHold(bookingId: string, depositPaymentIntentId: string, actorId: string | null, reason: string) {
  try {
    await cancelDepositPaymentIntent({ id: bookingId, stripeDepositPaymentIntentId: depositPaymentIntentId })
    await prisma.$transaction([
      prisma.booking.updateMany({
        where: { id: bookingId, stripeDepositPaymentIntentId: depositPaymentIntentId, depositStatus: DepositStatus.AUTHORIZED },
        data: { depositStatus: DepositStatus.RELEASED },
      }),
      prisma.bookingEvent.create({
        data: {
          bookingId,
          actorId,
          type: BookingEventType.PAYMENT_REFUNDED,
          metadata: { action: 'deposit_released', reason, paymentIntentId: depositPaymentIntentId },
        },
      }),
    ])
  } catch (error) {
    await recordPaymentError(bookingId, actorId, 'release_deposit', error)
  }
}

/** Releases the rent authorization of a booking that can't go ahead. */
async function releaseRentalAuthorization(booking: any, actorId: string) {
  if (!booking.stripePaymentIntentId) return
  try {
    await cancelPaymentIntent(booking)
  } catch (error) {
    await recordPaymentError(booking.id, actorId, 'release_rent_authorization', error)
  }
}

async function handleCancellationPayment(booking: any, actorId: string) {
  try {
    if (booking.status === 'PENDING' || booking.status === 'ACCEPTED') {
      // Payment now only happens at the ACCEPTED -> CONFIRMED step, so a
      // booking cancelled at PENDING or ACCEPTED has never had a PaymentIntent
      // authorized — there's nothing for Stripe to release or capture. Skip
      // the API call entirely rather than calling cancelPaymentIntent() with
      // a stripePaymentIntentId that doesn't exist.
      return
    }

    // A paid booking cancelled before pickup holds two authorizations: the
    // rent and the deposit. PICKUP_PENDING (the owner has started the handoff)
    // used to fall through here with both still on the renter's card, and
    // CONFIRMED released the rent but left the deposit hold for days.
    if (booking.status === 'CONFIRMED' || booking.status === 'PICKUP_PENDING') {
      if (booking.stripeDepositPaymentIntentId && booking.depositStatus === 'AUTHORIZED') {
        await releaseDepositHold(booking.id, booking.stripeDepositPaymentIntentId, actorId, 'booking_cancelled')
      }

      const feeCents = calculateCancellationFeeCents(booking.totalPrice)

      // Stripe rejects amount_to_capture: 0 — capturing is only valid for a
      // nonzero fee. With fees disabled for launch, feeCents is always 0, so
      // this falls through to a full release, same as the PENDING branch.
      // This keeps the fee-charging path intact and automatically reactivates
      // if calculateCancellationFeeCents starts returning a nonzero value.
      if (feeCents > 0) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: PaymentStatus.CAPTURE_PENDING },
        })
        await capturePaymentIntent(booking, feeCents)
      } else {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: PaymentStatus.REFUND_PENDING },
        })
        await cancelPaymentIntent(booking)
      }
      return
    }
  } catch (error) {
    // The booking's CANCELLED status has already committed by the time this
    // runs — this only records the refund/capture failure for the audit
    // trail. A failure to write that audit record shouldn't turn an already-
    // successful cancellation into a 500, so it's logged rather than thrown.
    try {
      await prisma.bookingEvent.create({
        data: {
          bookingId: booking.id,
          actorId,
          type: BookingEventType.ERROR,
          metadata: {
            action: 'cancel_payment',
            message: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
          },
        },
      })
    } catch (auditError) {
      console.error(
        '[Cancellation] Failed to write cancel_payment audit event for booking',
        booking.id,
        '— original payment error:',
        error,
        '— audit write error:',
        auditError
      )
    }
  }
}

export { createReviewObligationsForCompletedBooking, createBookingEvent, bookingSelect, toBookingResponse, withBookingLock }
