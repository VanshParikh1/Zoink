import { Prisma, ReviewRole, ReviewObligationStatus } from '@prisma/client'
import prisma from '../utils/prisma'

type SubmitReviewInput = {
  obligationId: string
  scoreA: number
  scoreB: number
  scoreC: number
  comment?: string
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
    throw new Error('REVIEW_INVALID_SCORE')
  }
}

export async function getPendingReviews(userId: string) {
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

export async function submitReview(userId: string, input: SubmitReviewInput) {
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
    throw new Error('REVIEW_OBLIGATION_NOT_FOUND')
  }

  if (obligation.userId !== userId) {
    throw new Error('REVIEW_FORBIDDEN')
  }

  if (obligation.status !== ReviewObligationStatus.PENDING || obligation.submittedReviewId) {
    throw new Error('REVIEW_ALREADY_SUBMITTED')
  }

  if (obligation.booking.status !== 'COMPLETED') {
    throw new Error('REVIEW_BOOKING_NOT_COMPLETED')
  }

  const comment = input.comment?.trim() || null

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
        comment,
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
        comment: true,
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

  return {
    ...result,
    reviewee,
    booking: {
      id: obligation.booking.id,
      listing: obligation.booking.listing,
    },
  }
}
