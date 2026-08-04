import api from './api'
import { Report, ReportReason, ReportTargetType } from '../types'

export type CreateReportPayload = {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  description?: string
}

export async function createReport(data: CreateReportPayload): Promise<Report> {
  const res = await api.post('/reports', data)
  return res.data
}
