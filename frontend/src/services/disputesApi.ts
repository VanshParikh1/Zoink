import api from './api'
import { Dispute, DisputeReason } from '../types'
import { DEMO_MODE } from '../config/demoMode'
import { mockCreateDispute, mockGetDispute, mockGetMyDisputes } from './mockWeek6'

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

export async function getDispute(id: string): Promise<Dispute> {
  if (DEMO_MODE) return mockGetDispute(id)

  const res = await api.get(`/disputes/${id}`)
  return res.data
}
