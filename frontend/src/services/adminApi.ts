import api from './api'
import { AdminDisputeDetail, AdminDisputeListItem, AdminReportListItem, BookingEvent, DisputeStatus, ReportStatus } from '../types'

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
  // Only meaningful when status is RESOLVED_REFUND. Omitted = full booking.totalPrice.
  refundAmountCents?: number
}

export async function resolveDispute(id: string, data: ResolveDisputePayload): Promise<AdminDisputeDetail> {
  const res = await api.patch(`/admin/disputes/${id}/resolve`, data)
  return res.data
}

export async function getBookingEvents(bookingId: string): Promise<BookingEvent[]> {
  const res = await api.get(`/admin/bookings/${bookingId}/events`)
  return res.data
}

export async function listReports(status?: ReportStatus): Promise<AdminReportListItem[]> {
  const res = await api.get('/admin/reports', { params: status ? { status } : undefined })
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
