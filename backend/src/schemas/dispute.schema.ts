import { z } from 'zod'
import { pageQuery } from '../utils/pagination'

export const CreateDisputeSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid(),
    reason: z.enum(['ITEM_DAMAGED', 'ITEM_NOT_RETURNED', 'ITEM_NOT_AS_DESCRIBED', 'PAYMENT_ISSUE', 'OTHER']),
    description: z
      .string()
      .min(10, 'Description must be at least 10 characters long.')
      .max(1000, 'Description cannot exceed 1000 characters.'),
  }),
})

export const ResolveDisputeSchema = z.object({
  body: z.object({
    status: z.enum(['RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED']),
    resolutionNotes: z
      .string()
      .min(1, 'Resolution notes are required.')
      .max(1000, 'Resolution notes cannot exceed 1000 characters.'),
    // Structural check only (positive integer cents). Omitted = the full remaining
    // amount. The upper bound (rent charged minus prior refunds, or the deposit)
    // depends on the booking and is enforced in disputeService.resolveDispute.
    refundAmountCents: z.number().int().positive().optional(),
    // RESOLVED_REFUND on a COMPLETED booking: RENT refunds the renter's rent (D-4),
    // DEPOSIT (the default) charges the held deposit to the owner. Before
    // completion only RENT applies.
    refundTarget: z.enum(['RENT', 'DEPOSIT']).optional(),
  }),
})

export const DisputeIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
})

// `limit` (or `cursor`) asks for a page; without either, the original list (capped).
export const AdminListDisputesQuerySchema = z.object({
  query: z.object({
    status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED']).optional(),
    ...pageQuery,
  }),
})

export const MyDisputesQuerySchema = z.object({
  query: z.object({
    status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED']).optional(),
    bookingId: z.string().uuid('bookingId must be a booking id.').optional(),
    ...pageQuery,
  }),
})
