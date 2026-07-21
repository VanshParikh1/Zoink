import { Request, Response } from 'express'
import { asyncHandler } from '../../utils/asyncHandler'
import * as disputeService from '../../services/disputeService'
import prisma from '../../utils/prisma'

// Extend Request inline to keep TypeScript happy without using `any`
interface AuthenticatedRequest extends Request {
  userId?: string
  role?: string
}

export const createDispute = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { bookingId, reason, description } = req.body
  const userId = req.userId!

  const dispute = await disputeService.createDispute(bookingId, userId, reason, description)
  res.status(201).json(dispute)
})

export const getDispute = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string
  const userId = req.userId
  const role = req.role

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: { booking: true }
  })

  if (!dispute) {
    return res.status(404).json({ error: 'Dispute not found' })
  }

  // Authorize: Admin or participants in the booking (renter / lender/owner)
  const isParticipant =
    dispute.booking &&
    (dispute.booking.renterId === userId || dispute.booking.ownerId === userId)

  if (role !== 'ADMIN' && !isParticipant) {
    return res.status(403).json({ error: 'Not authorized to view this dispute.' })
  }

  res.json(dispute)
})

export const getMyDisputes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!
  const status = req.query.status as string | undefined

  const disputes = await prisma.dispute.findMany({
    where: {
      raisedByUserId: userId,
      ...(status ? { status: status as any } : {})
    },
    include: { booking: true },
    orderBy: { createdAt: 'desc' }
  })

  res.json(disputes)
})