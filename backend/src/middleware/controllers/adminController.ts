import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import * as disputeService from '../../services/disputeService'
import prisma from '../../utils/prisma'
import { DisputeStatus } from '@prisma/client'

export const listDisputes = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as { status?: DisputeStatus }

  const where = status ? { status } : {}
  const disputes = await prisma.dispute.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      booking: { select: { id: true, status: true, totalPrice: true } },
      raisedByUser: { select: { id: true, email: true, firstName: true } }
    }
  })

  res.json(disputes)
})

export const getDisputeDetail = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      booking: {
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          totalPrice: true,
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

export const resolveDispute = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const { status, resolutionNotes } = req.body
  const adminId = (req as any).userId

  const dispute = await disputeService.resolveDispute(id, adminId, status, resolutionNotes)
  res.json(dispute)
})
