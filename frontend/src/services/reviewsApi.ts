import api from './api'
import { DEMO_MODE } from '../config/demoMode'
import { PendingReview, ReviewRole, SubmittedReviewResult } from '../types'
// Demo-mode mocks load only in a dev build that sets EXPO_PUBLIC_DEMO_MODE to
// 'true'. That value is inlined at build time, so in every other build this
// condition folds to false and Metro drops the require — the mock modules and
// their data never reach the bundle. (Calls below sit behind DEMO_MODE, which
// uses the same check; see config/demoMode.ts.)
const {
  mockGetPendingReviews,
  mockSubmitReview,
} = (__DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? require('./mockWeek6') : {}) as typeof import('./mockWeek6')

export type SubmitReviewPayload = {
  obligationId: string
  reviewerRole: ReviewRole
  scoreA: number
  scoreB: number
  scoreC: number
  // Borrower reviewer (RENTER) only
  itemRating?: number
  itemNotes?: string
  // Lender reviewer (LENDER) only
  personNotes?: string
}

/** The oldest review still owed, if any: the only one the app ever opens. */
export async function getFirstPendingReview(): Promise<PendingReview | null> {
  if (DEMO_MODE) return (await mockGetPendingReviews())[0] ?? null

  const res = await api.get('/reviews/pending', { params: { limit: 1 } })
  return res.data[0] ?? null
}

export async function submitReview(data: SubmitReviewPayload): Promise<SubmittedReviewResult> {
  if (DEMO_MODE) return mockSubmitReview(data)

  const res = await api.post('/reviews', data)
  return res.data
}
