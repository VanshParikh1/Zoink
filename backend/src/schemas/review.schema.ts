import { z } from 'zod'
import { ReviewRole } from '@prisma/client'

/**
 * Review-domain request schemas.
 *
 * scoreA/scoreB/scoreC were previously unbounded at the request-validation
 * layer — only reviewService.assertScore() caught out-of-range values, after
 * the controller had already blindly `Number(...)`-coerced whatever was sent.
 * Bounding them here (1-5, matching the star-rating UI) closes that gap.
 *
 * itemRating/itemNotes vs personNotes are mutually exclusive by reviewer role:
 * a borrower reviewer (RENTER) rates the item; a lender reviewer (LENDER)
 * leaves free-text notes about the renter instead. `reviewerRole` here is
 * client-declared (the client already has it from the pending-review payload
 * it's rendering) purely so this shape-level refine has something to check —
 * it is NOT trusted as authorization. reviewService.submitReview() re-derives
 * the real reviewerRole from the obligation row and rejects any mismatch, so
 * a client can't bypass this by lying about its own role.
 */

// ── POST /reviews ─────────────────────────────────────────────────────────────

export const SubmitReviewSchema = z.object({
  body: z
    .object({
      obligationId: z.string().uuid('obligationId must be a valid UUID.'),
      reviewerRole: z.nativeEnum(ReviewRole, { message: 'reviewerRole must be RENTER or LENDER.' }),
      scoreA: z.number().int('scoreA must be a whole number.').min(1).max(5),
      scoreB: z.number().int('scoreB must be a whole number.').min(1).max(5),
      scoreC: z.number().int('scoreC must be a whole number.').min(1).max(5),
      itemRating: z.number().int('itemRating must be a whole number.').min(1).max(5).optional(),
      itemNotes: z.string().max(280, 'itemNotes cannot exceed 280 characters.').optional(),
      personNotes: z.string().max(280, 'personNotes cannot exceed 280 characters.').optional(),
    })
    .refine(
      (body) => body.reviewerRole !== ReviewRole.RENTER || body.itemRating !== undefined,
      { message: 'itemRating is required when reviewerRole is RENTER.', path: ['itemRating'] }
    )
    .refine(
      (body) => body.reviewerRole === ReviewRole.RENTER || (body.itemRating === undefined && body.itemNotes === undefined),
      { message: 'itemRating/itemNotes are only valid when reviewerRole is RENTER.', path: ['itemRating'] }
    )
    .refine(
      (body) => body.reviewerRole === ReviewRole.LENDER || body.personNotes === undefined,
      { message: 'personNotes is only valid when reviewerRole is LENDER.', path: ['personNotes'] }
    ),
})
