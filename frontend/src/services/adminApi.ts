import api from './api'
import { AdminDisputeDetail, AdminDisputeListItem, AdminReportListItem, BookingEvent, DisputeStatus, ReportStatus } from '../types'
import type { Page } from '@zoink/shared'

const PAGE_SIZE = 20

export async function listDisputes(status: DisputeStatus | undefined, cursor?: string): Promise<Page<AdminDisputeListItem>> {
  const res = await api.get('/admin/disputes', { params: { status, limit: PAGE_SIZE, cursor } })
  return res.data
}

export async function getDisputeDetail(id: string): Promise<AdminDisputeDetail> {
  const res = await api.get(`/admin/disputes/${id}`)
  return res.data
}

export type ResolveDisputePayload = {
  status: 'RESOLVED_REFUND' | 'RESOLVED_NO_ACTION' | 'DISMISSED'
  resolutionNotes: string
  // Only meaningful when status is RESOLVED_REFUND. Omitted = full booking.totalPrice.
  refundAmountCents?: number
}

export async function resolveDispute(id: string, data: ResolveDisputePayload): Promise<AdminDisputeDetail> {
  const res = await api.patch(`/admin/disputes/${id}/resolve`, data)
  return res.data
}

/** The booking's audit trail, oldest first, a page at a time. */
export async function getBookingEvents(bookingId: string, cursor?: string): Promise<Page<BookingEvent>> {
  const res = await api.get(`/admin/bookings/${bookingId}/events`, { params: { limit: 50, cursor } })
  return res.data
}

export async function listReports(status: ReportStatus | undefined, cursor?: string): Promise<Page<AdminReportListItem>> {
  const res = await api.get('/admin/reports', { params: { status, limit: PAGE_SIZE, cursor } })
  return res.data
}

export type ResolveReportPayload = {
  status: 'REVIEWED' | 'DISMISSED'
  adminNotes?: string
}

export async function resolveReport(id: string, data: ResolveReportPayload): Promise<AdminReportListItem> {
  const res = await api.patch(`/admin/reports/${id}`, data)
  return res.data
}
