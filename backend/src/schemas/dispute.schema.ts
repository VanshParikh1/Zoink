import { z } from 'zod'

export const CreateDisputeSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid(),
    reason: z.enum(['ITEM_DAMAGED', 'ITEM_NOT_RETURNED', 'ITEM_NOT_AS_DESCRIBED', 'PAYMENT_ISSUE', 'OTHER']),
    description: z.string().min(10, 'Description must be at least 10 characters long.'),
  }),
})

export const ResolveDisputeSchema = z.object({
  body: z.object({
    status: z.enum(['RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED']),
    resolutionNotes: z.string().min(1, 'Resolution notes are required.'),
  }),
})

export const DisputeIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
})

export const AdminListDisputesQuerySchema = z.object({
  query: z.object({
    status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_NO_ACTION', 'DISMISSED']).optional(),
  }),
})
