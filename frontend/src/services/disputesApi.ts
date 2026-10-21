import api from './api'
import { Dispute, DisputeReason } from '../types'
import { DEMO_MODE } from '../config/demoMode'
// Demo-mode mocks load only in a dev build that sets EXPO_PUBLIC_DEMO_MODE to
// 'true'. That value is inlined at build time, so in every other build this
// condition folds to false and Metro drops the require — the mock modules and
// their data never reach the bundle. (Calls below sit behind DEMO_MODE, which
// uses the same check; see config/demoMode.ts.)
const {
  mockCreateDispute,
  mockGetMyDisputes,
} = (__DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? require('./mockWeek6') : {}) as typeof import('./mockWeek6')

export type CreateDisputePayload = {
  bookingId: string
  reason: DisputeReason
  description: string
}

export async function createDispute(data: CreateDisputePayload): Promise<Dispute> {
  if (DEMO_MODE) return mockCreateDispute(data)

  const res = await api.post('/disputes', data)
  return res.data
}

/** The dispute the current user filed on this booking, if any (the other party's isn't returned). */
export async function getMyDisputeForBooking(bookingId: string): Promise<Dispute | null> {
  if (DEMO_MODE) return (await mockGetMyDisputes()).find((dispute) => dispute.bookingId === bookingId) ?? null

  const res = await api.get('/disputes', { params: { bookingId } })
  return res.data[0] ?? null
}
