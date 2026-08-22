import api from './api'
import { DEMO_MODE } from '../config/demoMode'
import { PendingReview, SubmittedReviewResult } from '../types'
import { mockGetPendingReviews, mockSubmitReview } from './mockWeek6'

export type SubmitReviewPayload = {
  obligationId: string
  scoreA: number
  scoreB: number
  scoreC: number
  itemRating: number
  itemNotes?: string
}

export async function getPendingReviews(): Promise<PendingReview[]> {
  if (DEMO_MODE) return mockGetPendingReviews()

  const res = await api.get('/reviews/pending')
  return res.data
}

export async function submitReview(data: SubmitReviewPayload): Promise<SubmittedReviewResult> {
  if (DEMO_MODE) return mockSubmitReview(data)

  const res = await api.post('/reviews', data)
  return res.data
}
