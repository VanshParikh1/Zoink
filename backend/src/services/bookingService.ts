import { BookingEventType, BookingStatus, PaymentStatus, Prisma, ReviewRole } from '@prisma/client'
import prisma from '../utils/prisma'
import { assertBookingTransition } from '../middleware/bookingStateMachine'
import {
  BOOKING_DEPOSIT_RATE,
  calculateDepositAmount,
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

function scoreLabelsForRole(role: ReviewRole) {
  if (role === ReviewRole.RENTER) {
    return {
      scoreAKey: 'accuracy',
      scoreBKey: 'condition',
      scoreCKey: 'communication',
    }
  }

  return {
    scoreAKey: 'reliability',
    scoreBKey: 'care',
    scoreCKey: 'communication',
  }
}

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
  message: true,
  renterId: true,
  ownerId: true,
  listingId: true,
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

function mapPendingReviewForUser(booking: any, userId?: string) {
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
    targetUserId: obligation.targetUserId,
    listingTitle: booking.listing.title,
    reviewee: {
      id: reviewee.id,
      firstName: reviewee.firstName,
      lastName: reviewee.lastName,
      avatarUrl: reviewee.avatarUrl,
    },
    booking: {
      id: booking.id,
      startDate: booking.startDate,
      endDate: booking.endDate,
      completedAt: booking.completedAt,
      listing: booking.listing,
    },
  }
}

function toBookingResponse(booking: any, userId?: string) {
  const totalPrice = Number(booking.totalPrice)
  return {
    ...booking,
    totalPrice,
    depositAmount: Number(booking.depositAmount ?? calculateDepositAmount(totalPrice)),
    commissionAmount: Number(booking.commissionAmount ?? calculateCommission(totalPrice)),
    ownerPayout: Number(booking.ownerPayout ?? calculateOwnerPayout(totalPrice)),
    insuranceFee: Number(booking.insuranceFee ?? 0),
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
    throw new Error('BOOKING_NOT_FOUND')
  }

  if (booking.renterId !== userId && booking.ownerId !== userId) {
    throw new Error('BOOKING_FORBIDDEN')
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
    throw new Error('BOOKING_NOT_FOUND')
  }

  const overlapping = await prisma.booking.findFirst({
    where: {
      listingId,
      id: { not: bookingId },
      status: { in: ['ACCEPTED', 'ACTIVE'] },
      startDate: { lte: booking.endDate },
      endDate: { gte: booking.startDate },
    },
    select: { id: true },
  })

  if (overlapping) {
    throw new Error('BOOKING_OVERLAP')
  }
}

export async function createBooking(renterId: string, input: CreateBookingInput) {
  ensureValidBookingDates(input.startDate, input.endDate)

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true,
      ownerId: true,
      isAvailable: true,
      dailyPrice: true,
      itemValue: true,
      owner: {
        select: { id: true, stripeAccountId: true },
      },
    },
  })

  if (!listing) {
    throw new Error('LISTING_NOT_FOUND')
  }

  if (listing.ownerId === renterId) {
    throw new Error('BOOKING_SELF')
  }

  if (!listing.isAvailable) {
    throw new Error('BOOKING_LISTING_UNAVAILABLE')
  }

  const rentalDays = getRentalDays(input.startDate, input.endDate)

  if (rentalDays <= 0) {
    throw new Error('BOOKING_INVALID_DATES')
  }

  const dailyPrice = Number(listing.dailyPrice)
  const totalPrice = roundCurrency(dailyPrice * rentalDays)
  const depositAmount = calculateDepositAmount(totalPrice)
  const commissionAmount = calculateCommission(totalPrice)
  const ownerPayout = calculateOwnerPayout(totalPrice)
  const insuranceFee = calculateInsuranceFee(listing.itemValue, Boolean(input.insuranceOptIn))

  const booking = await prisma.$transaction(async (tx) => {
    const created: any = await tx.booking.create({
      data: {
        listingId: listing.id,
        renterId,
        ownerId: listing.ownerId,
        startDate: input.startDate,
        endDate: input.endDate,
        totalPrice: toDecimal(totalPrice),
        depositAmount: toDecimal(depositAmount),
        commissionAmount: toDecimal(commissionAmount),
        ownerPayout: toDecimal(ownerPayout),
        insuranceOptIn: Boolean(input.insuranceOptIn),
        insuranceFee: toDecimal(insuranceFee),
        message: input.message?.trim() || null,
      } as any,
      select: bookingSelect as any,
    })

    await createBookingEvent(tx, created.id, renterId, BookingEventType.STATUS_CHANGE, {
      status: created.status,
    })

    return created
  })

  const paymentIntent = await createPaymentIntent(booking, booking.renter.stripeCustomerId)
  const paymentStatus = getMockAuthorizedPaymentStatus()

  const bookingWithPayment: any = await prisma.$transaction(async (tx) => {
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
      clientSecret: paymentIntent.client_secret,
      paymentStatus,
    })

    return tx.booking.findUniqueOrThrow({
      where: { id: booking.id },
      select: bookingSelect as any,
    })
  })

  void notifyUser({
    userId: listing.ownerId,
    type: 'BOOKING_REQUEST',
    title: 'New booking request',
    body: 'A renter requested dates for one of your listings.',
    data: { bookingId: booking.id, listingId: listing.id },
  })

  return {
    ...toBookingResponse(bookingWithPayment),
    paymentClientSecret: paymentIntent.client_secret ?? null,
  }
}

export async function getBookingById(bookingId: string, userId: string) {
  const booking = await getBookingForParticipant(bookingId, userId)
  return toBookingResponse(booking, userId)
}

export async function getMyBookings(renterId: string) {
  const bookings: any[] = await prisma.booking.findMany({
    where: { renterId },
    select: bookingSelect as any,
    orderBy: { createdAt: 'desc' },
  })

  return bookings.map((booking: any) => toBookingResponse(booking, renterId))
}

export async function getIncomingRequests(ownerId: string) {
  const bookings: any[] = await prisma.booking.findMany({
    where: { ownerId },
    select: bookingSelect as any,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return bookings.map((booking: any) => toBookingResponse(booking, ownerId))
}

export async function transitionBookingStatus(bookingId: string, actorId: string, nextStatus: BookingStatus) {
  const booking: any = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) {
    throw new Error('BOOKING_NOT_FOUND')
  }

  const isOwner = booking.ownerId === actorId
  const isRenter = booking.renterId === actorId

  if (!isOwner && !isRenter) {
    throw new Error('BOOKING_FORBIDDEN')
  }

  if (nextStatus === 'ACCEPTED' || nextStatus === 'DECLINED' || nextStatus === 'ACTIVE' || nextStatus === 'COMPLETED') {
    if (!isOwner) {
      throw new Error('BOOKING_FORBIDDEN')
    }
  }

  if (nextStatus === 'CANCELLED' && !isOwner && !isRenter) {
    throw new Error('BOOKING_FORBIDDEN')
  }

  assertBookingTransition(booking.status, nextStatus)

  if (nextStatus === 'ACCEPTED') {
    await ensureNoOverlap(booking.listingId, booking.id)
    const stripeAccountId = await ensureOwnerStripeAccount(booking.ownerId)
    if (!stripeAccountId) {
      throw new Error('OWNER_STRIPE_ACCOUNT_REQUIRED')
    }

    if (booking.paymentStatus !== PaymentStatus.AUTHORIZED && booking.paymentStatus !== PaymentStatus.CAPTURED) {
      throw new Error('PAYMENT_NOT_AUTHORIZED')
    }
  }

  if (nextStatus !== 'COMPLETED') {
    const updated: any = await prisma.$transaction(async (tx) => {
      const result = await tx.booking.updateMany({
        where: { id: booking.id, version: booking.version },
        data: { status: nextStatus, version: { increment: 1 } },
      })

      if (result.count !== 1) {
        throw new Error('BOOKING_VERSION_CONFLICT')
      }

      await createBookingEvent(tx, booking.id, actorId, BookingEventType.STATUS_CHANGE, {
        from: booking.status,
        to: nextStatus,
      })

      return tx.booking.findUniqueOrThrow({
        where: { id: booking.id },
        select: bookingSelect as any,
      })
    })

    if (nextStatus === 'CANCELLED') {
      void handleCancellationPayment(booking, actorId)
    }

    if (nextStatus === 'ACCEPTED') {
      void notifyUser({
        userId: booking.renterId,
        type: 'BOOKING_ACCEPTED',
        title: 'Booking accepted',
        body: `${booking.listing.title} was approved by the owner.`,
        data: { bookingId: booking.id, listingId: booking.listingId },
      })
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
      throw new Error('BOOKING_VERSION_CONFLICT')
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
  const fee = Math.min(25, Math.max(5, Number(totalPrice) * 0.05))
  return toCents(fee)
}

async function handleCancellationPayment(booking: any, actorId: string) {
  try {
    if (booking.status === 'PENDING') {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: PaymentStatus.REFUND_PENDING },
      })
      await cancelPaymentIntent(booking)
      return
    }

    if (booking.status === 'ACCEPTED') {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: PaymentStatus.CAPTURE_PENDING },
      })
      await capturePaymentIntent(booking, calculateCancellationFeeCents(booking.totalPrice))
      return
    }
  } catch (error) {
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
  }
}

export { createReviewObligationsForCompletedBooking, createBookingEvent, bookingSelect }
