import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { asyncHandler } from '../../utils/asyncHandler'
import * as disputeService from '../../services/disputeService'
import prisma from '../../utils/prisma'

// Extend Request inline to keep TypeScript happy without using `any`
interface AuthenticatedRequest extends Request {
  userId?: string
  role?: string
}

// Shared Prisma projection for the user-facing dispute reads (getDispute /
// getMyDisputes). It pulls every dispute column the app renders plus a narrow
// booking projection (id / status / dates / listing title) that mirrors what a
// booking participant can already see via the booking endpoints. renterId /
// ownerId are selected only to run the authorization check in getDispute and
// are stripped from the response by toDisputeResponse().
const disputeSelect = {
  id: true,
  bookingId: true,
  raisedByUserId: true,
  reason: true,
  description: true,
  status: true,
  resolutionNotes: true,
  resolvedByAdminId: true,
  refundAmountCents: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  booking: {
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      renterId: true,
      ownerId: true,
      listing: { select: { title: true } },
    },
  },
} satisfies Prisma.DisputeSelect

type DisputeRow = Prisma.DisputeGetPayload<{ select: typeof disputeSelect }>

// Project a raw dispute row into the response shape for a given caller.
//  - ADMIN keeps the full shape (internal adjudication fields included) — the
//    admin dispute screens already surface all of this via /admin/disputes.
//  - A booking participant sees the dispute outcome fields the app shows them
//    (status, resolutionNotes, refund amount, timestamps) but never the
//    internal resolvedByAdminId.
//  - Only the caller who raised the dispute sees its free-text description; it
//    is withheld from the counterparty the dispute was raised against.
// Exported for unit testing of the projection itself.
export function toDisputeResponse(dispute: DisputeRow, callerId: string | undefined, role: string | undefined) {
  const isAdmin = role === 'ADMIN'
  const isRaiser = dispute.raisedByUserId === callerId

  const booking = dispute.booking
    ? {
        id: dispute.booking.id,
        status: dispute.booking.status,
        startDate: dispute.booking.startDate,
        endDate: dispute.booking.endDate,
        listing: dispute.booking.listing ? { title: dispute.booking.listing.title } : null,
      }
    : null

  return {
    id: dispute.id,
    bookingId: dispute.bookingId,
    raisedByUserId: dispute.raisedByUserId,
    reason: dispute.reason,
    status: dispute.status,
    resolutionNotes: dispute.resolutionNotes,
    refundAmountCents: dispute.refundAmountCents,
    createdAt: dispute.createdAt,
    updatedAt: dispute.updatedAt,
    resolvedAt: dispute.resolvedAt,
    ...(isAdmin || isRaiser ? { description: dispute.description } : {}),
    ...(isAdmin ? { resolvedByAdminId: dispute.resolvedByAdminId } : {}),
    booking,
  }
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
    select: disputeSelect
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

  res.json(toDisputeResponse(dispute, userId, role))
})

export const getMyDisputes = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!
  const role = req.role
  const status = req.query.status as string | undefined

  const disputes = await prisma.dispute.findMany({
    where: {
      raisedByUserId: userId,
      ...(status ? { status: status as any } : {})
    },
    select: disputeSelect,
    orderBy: { createdAt: 'desc' }
  })

  res.json(disputes.map((dispute) => toDisputeResponse(dispute, userId, role)))
})
