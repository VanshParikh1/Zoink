import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import * as reportService from '../../services/reportService'

interface AuthenticatedRequest extends Request {
  userId?: string
}

export const createReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { targetType, targetId, reason, description } = req.body
  const reporterId = req.userId!

  const report = await reportService.createReport(reporterId, targetType, targetId, reason, description)
  res.status(201).json(report)
})
