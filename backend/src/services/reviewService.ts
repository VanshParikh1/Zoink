import { Prisma, ReviewRole, ReviewObligationStatus } from '@prisma/client'
import type { PendingReviewResponse, SubmitReviewResult } from '@zoink/shared'
import prisma from '../utils/prisma'
import { notifyUser } from './notificationService'
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from '../utils/errors'

type SubmitReviewInput = {
  obligationId: string
  // Client-declared, used only for the schema-level refine (see
  // review.schema.ts). Never trusted here — the real reviewerRole always
  // comes from the obligation row looked up below.
  reviewerRole: ReviewRole
  scoreA: number
  scoreB: number
  scoreC: number
  itemRating?: number
  itemNotes?: string
  personNotes?: string
}

function average(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function toDecimal(value: number | null) {
  return value === null ? null : new Prisma.Decimal(value.toFixed(2))
}

export function scoreLabelsForRole(role: ReviewRole) {
  if (role === ReviewRole.RENTER) {
    return {
      scoreAKey: 'accuracy',
      scoreBKey: 'condition',
      scoreCKey: 'pickupExperience',
    }
  }

  return {
    scoreAKey: 'reliability',
    scoreBKey: 'care',
    scoreCKey: 'communication',
  }
}

async function recomputeUserReputation(tx: Prisma.TransactionClient, userId: string) {
  const completedRentalsCount = await tx.booking.count({
    where: {
      status: 'COMPLETED',
      OR: [{ renterId: userId }, { ownerId: userId }],
    },
  })

  const lenderReviews = await tx.review.findMany({
    where: {
      revieweeId: userId,
      reviewerRole: ReviewRole.RENTER,
    },
    select: {
      scoreA: true,
      scoreB: true,
      scoreC: true,
    },
  })

  const renterReviews = await tx.review.findMany({
    where: {
      revieweeId: userId,
      reviewerRole: ReviewRole.LENDER,
    },
    select: {
      scoreA: true,
      scoreB: true,
      scoreC: true,
    },
  })

  const lenderAccuracyAvg = average(lenderReviews.map((review) => review.scoreA))
  const lenderConditionAvg = average(lenderReviews.map((review) => review.scoreB))
  const lenderCommunicationAvg = average(lenderReviews.map((review) => review.scoreC))
  const renterReliabilityAvg = average(renterReviews.map((review) => review.scoreA))
  const renterCareAvg = average(renterReviews.map((review) => review.scoreB))
  const renterCommunicationAvg = average(renterReviews.map((review) => review.scoreC))

  const allReceivedReviews = [...lenderReviews, ...renterReviews]
  const reviewsReceivedCount = allReceivedReviews.length

  await tx.userReputation.upsert({
    where: { userId },
    create: {
      userId,
      reviewsReceivedCount,
      rentalsCompletedCount: completedRentalsCount,
      overallLenderRating: toDecimal(average([lenderAccuracyAvg, lenderConditionAvg, lenderCommunicationAvg].filter((value): value is number => value !== null))),
      overallRenterRating: toDecimal(average([renterReliabilityAvg, renterCareAvg, renterCommunicationAvg].filter((value): value is number => value !== null))),
      lenderAccuracyAvg: toDecimal(lenderAccuracyAvg),
      lenderConditionAvg: toDecimal(lenderConditionAvg),
      lenderCommunicationAvg: toDecimal(lenderCommunicationAvg),
      renterReliabilityAvg: toDecimal(renterReliabilityAvg),
      renterCareAvg: toDecimal(renterCareAvg),
      renterCommunicationAvg: toDecimal(renterCommunicationAvg),
    },
    update: {
      reviewsReceivedCount,
      rentalsCompletedCount: completedRentalsCount,
      overallLenderRating: toDecimal(average([lenderAccuracyAvg, lenderConditionAvg, lenderCommunicationAvg].filter((value): value is number => value !== null))),
      overallRenterRating: toDecimal(average([renterReliabilityAvg, renterCareAvg, renterCommunicationAvg].filter((value): value is number => value !== null))),
      lenderAccuracyAvg: toDecimal(lenderAccuracyAvg),
      lenderConditionAvg: toDecimal(lenderConditionAvg),
      lenderCommunicationAvg: toDecimal(lenderCommunicationAvg),
      renterReliabilityAvg: toDecimal(renterReliabilityAvg),
      renterCareAvg: toDecimal(renterCareAvg),
      renterCommunicationAvg: toDecimal(renterCommunicationAvg),
    },
  })
}

function assertScore(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new BadRequestError('Scores must be whole numbers between 1 and 5.')
  }
}

function assertItemRating(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new BadRequestError('Item rating must be a whole number between 1 and 5.')
  }
}

// A borrower reviewer (RENTER) rates the item; a lender reviewer (LENDER)
// leaves free-text notes about the renter instead. Re-derives which fields
// are valid strictly from the obligation's real reviewerRole (never from
// client input), so a client can't smuggle itemRating into a lender-authored
// review (or vice versa) by lying about its own role in the request body.
function resolveReviewFields(reviewerRole: ReviewRole, input: SubmitReviewInput) {
  if (reviewerRole === ReviewRole.RENTER) {
    if (input.itemRating === undefined) {
      throw new BadRequestError('itemRating is required for this review.')
    }
    assertItemRating(input.itemRating)

    return {
      itemRating: input.itemRating,
      itemNotes: input.itemNotes?.trim() || null,
      personNotes: null,
    }
  }

  return {
    itemRating: null,
    itemNotes: null,
    personNotes: input.personNotes?.trim() || null,
  }
}

export async function getPendingReviews(userId: string): Promise<PendingReviewResponse[]> {
  const obligations = await prisma.reviewObligation.findMany({
    where: {
      userId,
      status: ReviewObligationStatus.PENDING,
    },
    select: {
      id: true,
      bookingId: true,
      targetUserId: true,
      reviewerRole: true,
      status: true,
      createdAt: true,
      booking: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
          completedAt: true,
          listing: {
            select: {
              id: true,
              title: true,
              category: true,
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
            },
          },
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      },
    } as any,
    orderBy: { createdAt: 'asc' },
  })

  return obligations.map((obligation: any) => {
    const reviewee = obligation.targetUserId === obligation.booking.owner.id ? obligation.booking.owner : obligation.booking.renter
    return {
      id: obligation.id,
      bookingId: obligation.bookingId,
      reviewerRole: obligation.reviewerRole,
      status: obligation.status,
      scoreLabels: scoreLabelsForRole(obligation.reviewerRole),
      createdAt: obligation.createdAt,
      reviewee,
      booking: {
        id: obligation.booking.id,
        startDate: obligation.booking.startDate,
        endDate: obligation.booking.endDate,
        completedAt: obligation.booking.completedAt,
        listing: obligation.booking.listing,
      },
    }
  })
}

export async function submitReview(userId: string, input: SubmitReviewInput): Promise<SubmitReviewResult> {
  assertScore(input.scoreA)
  assertScore(input.scoreB)
  assertScore(input.scoreC)

  const obligation = await prisma.reviewObligation.findUnique({
    where: { id: input.obligationId },
    select: {
      id: true,
      bookingId: true,
      userId: true,
      targetUserId: true,
      reviewerRole: true,
      status: true,
      submittedReviewId: true,
      booking: {
        select: {
          id: true,
          status: true,
          listing: {
            select: {
              id: true,
              title: true,
            },
          },
          renter: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  })

  if (!obligation) {
    throw new NotFoundError('Review prompt not found.')
  }

  if (obligation.userId !== userId) {
    throw new ForbiddenError('You cannot submit this review.')
  }

  if (obligation.status !== ReviewObligationStatus.PENDING || obligation.submittedReviewId) {
    throw new ConflictError('This review has already been submitted.')
  }

  if (obligation.booking.status !== 'COMPLETED') {
    throw new BadRequestError('This rental is not ready for review yet.')
  }

  if (input.reviewerRole !== obligation.reviewerRole) {
    throw new BadRequestError('reviewerRole does not match this review obligation.')
  }

  const reviewFields = resolveReviewFields(obligation.reviewerRole, input)

  const result = await prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        bookingId: obligation.bookingId,
        reviewerId: userId,
        revieweeId: obligation.targetUserId,
        reviewerRole: obligation.reviewerRole,
        scoreA: input.scoreA,
        scoreB: input.scoreB,
        scoreC: input.scoreC,
        ...reviewFields,
      },
      select: {
        id: true,
        bookingId: true,
        reviewerId: true,
        revieweeId: true,
        reviewerRole: true,
        scoreA: true,
        scoreB: true,
        scoreC: true,
        itemRating: true,
        itemNotes: true,
        personNotes: true,
        createdAt: true,
      },
    })

    await tx.reviewObligation.update({
      where: { id: obligation.id },
      data: {
        status: ReviewObligationStatus.SUBMITTED,
        submittedReviewId: review.id,
      },
    })

    await recomputeUserReputation(tx, obligation.targetUserId)

    const pendingRemaining = await tx.reviewObligation.count({
      where: {
        userId,
        status: ReviewObligationStatus.PENDING,
      },
    })

    return { review, pendingRemaining }
  })

  const reviewee = obligation.targetUserId === obligation.booking.owner.id ? obligation.booking.owner : obligation.booking.renter

  void notifyUser({
    userId: obligation.targetUserId,
    type: 'REVIEW_RECEIVED',
    title: 'New review received',
    body: `A new review just landed for ${obligation.booking.listing.title}.`,
    data: { bookingId: obligation.booking.id, reviewId: result.review.id },
  })

  return {
    ...result,
    review: {
      ...result.review,
      createdAt: result.review.createdAt.toISOString(),
    },
    reviewee,
    booking: {
      id: obligation.booking.id,
      listing: obligation.booking.listing,
    },
  }
}
