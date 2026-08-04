import { z } from 'zod'

/**
 * Review-domain request schemas.
 *
 * scoreA/scoreB/scoreC were previously unbounded at the request-validation
 * layer — only reviewService.assertScore() caught out-of-range values, after
 * the controller had already blindly `Number(...)`-coerced whatever was sent.
 * Bounding them here (1-5, matching the star-rating UI) closes that gap.
 */

// ── POST /reviews ─────────────────────────────────────────────────────────────

export const SubmitReviewSchema = z.object({
  body: z.object({
    obligationId: z.string().uuid('obligationId must be a valid UUID.'),
    scoreA: z.number().int('scoreA must be a whole number.').min(1).max(5),
    scoreB: z.number().int('scoreB must be a whole number.').min(1).max(5),
    scoreC: z.number().int('scoreC must be a whole number.').min(1).max(5),
    comment: z.string().max(280, 'comment cannot exceed 280 characters.').optional(),
  }),
})
