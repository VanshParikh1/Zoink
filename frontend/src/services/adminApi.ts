import api from './api'
import { AdminDisputeDetail, AdminDisputeListItem, DisputeStatus } from '../types'

export async function listDisputes(status?: DisputeStatus): Promise<AdminDisputeListItem[]> {
  const res = await api.get('/admin/disputes', { params: status ? { status } : undefined })
  return res.data
}

export async function getDisputeDetail(id: string): Promise<AdminDisputeDetail> {
  const res = await api.get(`/admin/disputes/${id}`)
  return res.data
}

export type ResolveDisputePayload = {
  status: 'RESOLVED_REFUND' | 'RESOLVED_NO_ACTION' | 'DISMISSED'
  resolutionNotes: string
}

export async function resolveDispute(id: string, data: ResolveDisputePayload): Promise<AdminDisputeDetail> {
  const res = await api.patch(`/admin/disputes/${id}/resolve`, data)
  return res.data
}
