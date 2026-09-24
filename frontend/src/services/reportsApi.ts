import api from './api'
import { DEMO_MODE } from '../config/demoMode'
import { Report, ReportReason, ReportTargetType } from '../types'

export type CreateReportPayload = {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  description?: string
}

export async function createReport(data: CreateReportPayload): Promise<Report> {
  if (DEMO_MODE) {
    // No moderation queue in demo mode — echo back what a filed report looks like.
    return {
      id: `demo-report-${Date.now()}`,
      reporterId: 'demo-user-1',
      targetType: data.targetType,
      targetId: data.targetId,
      reason: data.reason,
      description: data.description ?? null,
      status: 'OPEN',
      adminNotes: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedByAdminId: null,
    } as Report
  }

  const res = await api.post('/reports', data)
  return res.data
}
