import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import * as disputeService from '../../services/disputeService'
import * as bookingEventService from '../../services/bookingEventService'
import * as reportService from '../../services/reportService'
import prisma from '../../utils/prisma'
import { DisputeStatus, ReportStatus } from '@prisma/client'
import { createdAtAfter, createdAtKey, createdAtOrder, isPaged, LEGACY_LIST_CAP, pageSize, splitPage, type PageParams } from '../../utils/pagination'

interface AuthenticatedRequest extends Request {
  userId?: string
  role?: string
}

// Newest first. With `limit` (or `cursor`): { items, nextCursor }; without,
// the original array, capped.
export const listDisputes = asyncHandler(async (req: Request, res: Response) => {
  const { status, ...params } = req.query as { status?: DisputeStatus } & PageParams
  const paged = isPaged(params)
  const size = pageSize(params)

  const disputes = await prisma.dispute.findMany({
    where: { ...(status ? { status } : {}), ...createdAtAfter(params.cursor, 'desc') },
    orderBy: createdAtOrder('desc'),
    take: paged ? size + 1 : LEGACY_LIST_CAP,
    include: {
      booking: { select: { id: true, status: true, totalPrice: true } },
      raisedByUser: { select: { id: true, email: true, firstName: true } }
    }
  })

  res.json(paged ? splitPage(disputes, size, createdAtKey) : disputes)
})

export const getDisputeDetail = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string

  if (!id) {
    return res.status(400).json({ error: 'Dispute ID is required' })
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          totalPrice: true,
          depositAmount: true,
          pickupPhotos: true,
          returnPhotos: true,
          handoffInitiatedAt: true,
          returnInitiatedAt: true,
        }
      },
      raisedByUser: { select: { id: true, email: true, firstName: true } },
      resolvedByAdmin: { select: { id: true, email: true, firstName: true } }
    }
  })

  if (!dispute) {
    return res.status(404).json({ error: 'Dispute not found' })
  }

  res.json(dispute)
})

export const resolveDispute = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string
  const { status, resolutionNotes, refundAmountCents } = req.body
  const adminId = req.userId

  if (!adminId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!status || !Object.values(DisputeStatus).includes(status)) {
    return res.status(400).json({ error: 'Invalid or missing dispute status' })
  }

  const dispute = await disputeService.resolveDispute(id, adminId, status, resolutionNotes, refundAmountCents)
  res.json(dispute)
})

export const getBookingEvents = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string
  const params = req.query as PageParams

  if (isPaged(params)) return res.json(await bookingEventService.listBookingEventsPage(id, params))
  const events = await bookingEventService.getBookingEvents(id)
  res.json(events)
})

// Newest first; paged like listDisputes.
export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const { status, ...params } = req.query as { status?: ReportStatus } & PageParams
  const paged = isPaged(params)
  const size = pageSize(params)

  const reports = await prisma.report.findMany({
    where: { ...(status ? { status } : {}), ...createdAtAfter(params.cursor, 'desc') },
    orderBy: createdAtOrder('desc'),
    take: paged ? size + 1 : LEGACY_LIST_CAP,
    include: {
      reporter: { select: { id: true, email: true, firstName: true } }
    }
  })

  if (!paged) return res.json(await reportService.attachTargetLabels(reports))
  const page = splitPage(reports, size, createdAtKey)
  res.json({ items: await reportService.attachTargetLabels(page.items), nextCursor: page.nextCursor })
})

export const resolveReport = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string
  const { status, adminNotes } = req.body
  const adminId = req.userId

  if (!adminId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const report = await reportService.resolveReport(id, adminId, status, adminNotes)
  res.json(report)
})