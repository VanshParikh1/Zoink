import { Request, Response } from 'express'
import * as reviewService from '../../services/reviewService'
import { asyncHandler } from '../../utils/asyncHandler'

export const getPendingReviews = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string

  const reviews = await reviewService.getPendingReviews(userId)
  return res.json(reviews)
})

export const submitReview = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string
  const { obligationId, reviewerRole, scoreA, scoreB, scoreC, itemRating, itemNotes, personNotes } = req.body

  if (!obligationId) {
    return res.status(400).json({ error: 'obligationId is required.' })
  }

  const review = await reviewService.submitReview(userId, {
    obligationId,
    reviewerRole,
    scoreA: Number(scoreA),
    scoreB: Number(scoreB),
    scoreC: Number(scoreC),
    itemRating: itemRating === undefined ? undefined : Number(itemRating),
    itemNotes,
    personNotes,
  })

  return res.status(201).json(review)
})
