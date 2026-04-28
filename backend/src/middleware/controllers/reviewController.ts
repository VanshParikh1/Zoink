import { Request, Response } from 'express'
import * as reviewService from '../../services/reviewService'

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
  const map: Record<string, { status: number; message: string }> = {
    REVIEW_OBLIGATION_NOT_FOUND: { status: 404, message: 'Review prompt not found.' },
    REVIEW_FORBIDDEN: { status: 403, message: 'You cannot submit this review.' },
    REVIEW_ALREADY_SUBMITTED: { status: 409, message: 'This review has already been submitted.' },
    REVIEW_BOOKING_NOT_COMPLETED: { status: 400, message: 'This rental is not ready for review yet.' },
    REVIEW_INVALID_SCORE: { status: 400, message: 'Scores must be whole numbers between 1 and 5.' },
  }

  const mapped = map[message]
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message })
  }

  console.error('Unhandled review error:', error)
  return res.status(500).json({ error: 'Something went wrong.' })
}

export async function getPendingReviews(req: Request, res: Response) {
  const userId = (req as any).userId as string

  try {
    const reviews = await reviewService.getPendingReviews(userId)
    return res.json(reviews)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function submitReview(req: Request, res: Response) {
  const userId = (req as any).userId as string
  const { obligationId, scoreA, scoreB, scoreC, comment } = req.body

  if (!obligationId) {
    return res.status(400).json({ error: 'obligationId is required.' })
  }

  try {
    const review = await reviewService.submitReview(userId, {
      obligationId,
      scoreA: Number(scoreA),
      scoreB: Number(scoreB),
      scoreC: Number(scoreC),
      comment,
    })

    return res.status(201).json(review)
  } catch (error) {
    return handleError(res, error)
  }
}
