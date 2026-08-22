import { BookingEventType, BookingStatus, PaymentStatus, Prisma, ReviewRole } from '@prisma/client'
import type { BookingResponse, PendingReviewResponse, UserSummary } from '@zoink/shared'
import prisma from '../utils/prisma'
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors'
import { assertBookingTransition } from '../middleware/bookingStateMachine'
import {
  ensureValidBookingDates,
  getRentalDays,
  roundCurrency,
} from './bookingUtils'
import { notifyUser } from './notificationService'
import {
  calculateCommission,
  calculateInsuranceFee,
  calculateOwnerPayout,
  cancelPaymentIntent,
  capturePaymentIntent,
  createPaymentIntent,
  getConnectAccountStatus,
  getMockAuthorizedPaymentStatus,
  toCents,
  toDecimal,
} from './paymentService'
import { scoreLabelsForRole } from './reviewService'

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
  stripePaymentIntentId: true,
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
      stripeAccountId: true,
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

export type CreateBookingInput = {
  listingId: string
  startDate: Date
  endDate: Date
  message?: string
  insuranceOptIn?: boolean
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

function toBookingResponse(booking: any, userId?: string): BookingResponse {
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
    commissionAmount: Number(booking.commissionAmount ?? calculateCommission(totalPrice)),
    ownerPayout: Number(booking.ownerPayout ?? calculateOwnerPayout(totalPrice)),
    insuranceOptIn: booking.insuranceOptIn,
    insuranceFee: Number(booking.insuranceFee ?? 0),
    stripePaymentIntentId: booking.stripePaymentIntentId,
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

async function ensureNoOverlap(listingId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, startDate: true, endDate: true },
  })

  if (!booking) {
    throw new NotFoundError('Booking not found.')
  }

  const overlapping = await prisma.booking.findFirst({
    where: {
      listingId,
      id: { not: bookingId },
      status: { in: ['CONFIRMED', 'ACTIVE'] },
      startDate: { lte: booking.endDate },
      endDate: { gte: booking.startDate },
    },
    select: { id: true },
  })

  if (overlapping) {
    throw new ConflictError('Those dates overlap with another accepted booking.')
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

  if (!listing.isAvailable) {
    throw new BadRequestError('This listing is currently unavailable.')
  }

  const rentalDays = getRentalDays(input.startDate, input.endDate)

  if (rentalDays <= 0) {
    throw new BadRequestError('Start and end dates are invalid.')
  }

  const dailyPrice = Number(listing.dailyPrice)
  const totalPrice = roundCurrency(dailyPrice * rentalDays)
  const depositAmount = Number(listing.depositAmount)
  const commissionAmount = calculateCommission(totalPrice)
  const ownerPayout = calculateOwnerPayout(totalPrice)
  const insuranceFee = calculateInsuranceFee(listing.itemValue, Boolean(input.insuranceOptIn))

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
        insuranceOptIn: Boolean(input.insuranceOptIn),
        insuranceFee: toDecimal(insuranceFee),
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

export async function createPaymentIntentForBooking(bookingId: string, renterId: string): Promise<BookingResponse> {
  const booking = await getBookingForParticipant(bookingId, renterId)

  if (booking.renterId !== renterId) {
    throw new ForbiddenError('You do not have access to this booking.')
  }

  if (booking.status !== 'ACCEPTED') {
    throw new ConflictError('This booking is not ready for payment.')
  }

  const paymentIntent = await createPaymentIntent(booking, booking.renter.stripeCustomerId)
  const paymentStatus = getMockAuthorizedPaymentStatus()

  const updated: any = await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus,
        version: { increment: 1 },
      },
    })

    await createBookingEvent(tx, booking.id, renterId, BookingEventType.PAYMENT_INTENT_CREATED, {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      paymentStatus,
    })

    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: bookingSelect as any,
    })
  })

  return {
    ...toBookingResponse(updated, renterId),
    paymentClientSecret: paymentIntent.client_secret ?? null,
  }
}

export async function getBookingById(bookingId: string, userId: string): Promise<BookingResponse> {
  const booking = await getBookingForParticipant(bookingId, userId)
  return toBookingResponse(booking, userId)
}

export async function getMyBookings(renterId: string): Promise<BookingResponse[]> {
  const bookings: any[] = await prisma.booking.findMany({
    where: { renterId },
    select: bookingSelect as any,
    orderBy: { createdAt: 'desc' },
  })

  return bookings.map((booking: any) => toBookingResponse(booking, renterId))
}

export async function getIncomingRequests(ownerId: string): Promise<BookingResponse[]> {
  const bookings: any[] = await prisma.booking.findMany({
    where: { ownerId },
    select: bookingSelect as any,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return bookings.map((booking: any) => toBookingResponse(booking, ownerId))
}

export async function transitionBookingStatus(bookingId: string, actorId: string, nextStatus: BookingStatus): Promise<BookingResponse> {
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

  if (nextStatus === 'ACCEPTED' || nextStatus === 'DECLINED' || nextStatus === 'ACTIVE' || nextStatus === 'COMPLETED') {
    if (!isOwner) {
      throw new ForbiddenError('You do not have access to this booking.')
    }
  }

  if (nextStatus === 'CANCELLED' && !isOwner && !isRenter) {
    throw new ForbiddenError('You do not have access to this booking.')
  }

  if (nextStatus === 'CONFIRMED' && !isRenter) {
    throw new ForbiddenError('You do not have access to this booking.')
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

  if (nextStatus === 'CONFIRMED') {
    // This is the new payment checkpoint — dates only truly lock once payment
    // is authorized, which is why ensureNoOverlap (CONFIRMED/ACTIVE only) is
    // re-checked here: two different ACCEPTED-but-unpaid requests can overlap
    // (accepting doesn't block on other ACCEPTED bookings), so the second one
    // to reach this step must still be rejected if the first already confirmed.
    await ensureNoOverlap(booking.listingId, booking.id)

    if (booking.paymentStatus !== PaymentStatus.AUTHORIZED && booking.paymentStatus !== PaymentStatus.CAPTURED) {
      throw new ConflictError('Payment authorization is not ready yet.')
    }
  }

  if (nextStatus !== 'COMPLETED') {
    const { updated, autoRejected } = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: booking.id, version: booking.version },
        data: { status: nextStatus, version: { increment: 1 } },
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
      let autoRejected: { id: string; renterId: string }[] = []
      if (nextStatus === 'ACCEPTED') {
        autoRejected = await tx.booking.findMany({
          where: {
            listingId: booking.listingId,
            id: { not: booking.id },
            status: 'PENDING',
            startDate: { lte: booking.endDate },
            endDate: { gte: booking.startDate },
          },
          select: { id: true, renterId: true },
        })

        if (autoRejected.length > 0) {
          await tx.booking.updateMany({
            where: { id: { in: autoRejected.map((b) => b.id) } },
            data: { status: 'DECLINED', version: { increment: 1 } },
          })

          for (const rejected of autoRejected) {
            await createBookingEvent(tx, rejected.id, actorId, BookingEventType.STATUS_CHANGE, {
              from: 'PENDING',
              to: 'DECLINED',
              reason: 'overlap_auto_reject',
            })
          }
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

    if (nextStatus === 'CONFIRMED') {
      void notifyUser({
        userId: booking.ownerId,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment received',
        body: `${booking.listing.title} is booked and paid for — you can start the handoff.`,
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

  const completed = await prisma.$transaction(async (tx) => {
    const result = await tx.booking.updateMany({
      where: { id: booking.id, version: booking.version },
      data: {
        status: nextStatus,
        completedAt: new Date(),
        paymentStatus: booking.paymentStatus === PaymentStatus.CAPTURED ? PaymentStatus.PAYOUT_PENDING : booking.paymentStatus,
        version: { increment: 1 },
      },
    })

    if (result.count !== 1) {
      throw new ConflictError('This booking was updated by someone else. Please refresh and try again.')
    }

    await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
      from: booking.status,
      to: nextStatus,
    })

    const completedBooking: any = await tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: bookingSelect as any,
    })

    await createReviewObligationsForCompletedBooking(tx, completedBooking)

    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: bookingSelect as any,
    })
  })

  void notifyUser({
    userId: booking.renterId,
    type: 'BOOKING_ACCEPTED',
    title: 'Rental completed',
    body: `Your rental for ${booking.listing.title} has been marked complete.`,
    data: { bookingId: booking.id, listingId: booking.listingId },
  })

  if (booking.ownerId !== booking.renterId) {
    void notifyUser({
      userId: booking.ownerId,
      type: 'BOOKING_ACCEPTED',
      title: 'Rental completed',
      body: `${booking.listing.title} has been marked complete.`,
      data: { bookingId: booking.id, listingId: booking.listingId },
    })
  }

  return toBookingResponse(completed, actorId)
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

    if (booking.status === 'CONFIRMED') {
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

export { createReviewObligationsForCompletedBooking, createBookingEvent, bookingSelect }
