import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import * as disputeService from '../../services/disputeService'
import prisma from '../../utils/prisma'

export const createDispute = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, reason, description } = req.body
  const userId = (req as any).userId

  const dispute = await disputeService.createDispute(bookingId, userId, reason, description)
  res.status(201).json(dispute)
})

export const getDispute = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const userId = (req as any).userId
  const role = (req as any).role

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: { booking: true }
  })

  if (!dispute) {
    return res.status(404).json({ error: 'Dispute not found' })
  }

  // Only allow admin, owner, or renter to view
  if (role !== 'ADMIN' && dispute.booking.ownerId !== userId && dispute.booking.renterId !== userId) {
    return res.status(403).json({ error: 'Not authorized to view this dispute.' })
  }

  res.json(dispute)
})

export const getMyDisputes = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId

  const disputes = await prisma.dispute.findMany({
    where: { raisedByUserId: userId },
    orderBy: { createdAt: 'desc' }
  })

  res.json(disputes)
})
