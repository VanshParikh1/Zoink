import api from './api'
import { Dispute, DisputeReason } from '../types'
import { DEMO_MODE } from '../config/demoMode'
// Demo-mode mocks load only when the build sets EXPO_PUBLIC_DEMO_MODE to
// 'true'. That value is inlined at build time, so in every other build this
// condition folds to false and Metro drops the require — the mock modules and
// their data never reach the bundle. (Calls below sit behind DEMO_MODE, which
// uses the same check; see config/demoMode.ts.)
const {
  mockCreateDispute,
  mockGetMyDisputes,
} = (process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? require('./mockWeek6') : {}) as typeof import('./mockWeek6')

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

export async function getMyDisputes(): Promise<Dispute[]> {
  if (DEMO_MODE) return mockGetMyDisputes()

  const res = await api.get('/disputes')
  return res.data
}
