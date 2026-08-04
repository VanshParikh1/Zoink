import { z } from 'zod'

/**
 * User-domain request schemas.
 *
 * Phone format is intentionally not re-validated here (unlike RegisterSchema) —
 * profile updates have historically accepted a loosely-typed phone string, and
 * tightening that is out of scope for this pass.
 */

// ── PATCH /users/me ───────────────────────────────────────────────────────────

export const UpdateMeSchema = z.object({
  body: z.object({
    firstName: z.string().min(1).max(50, 'firstName cannot exceed 50 characters.').optional(),
    lastName: z.string().min(1).max(50, 'lastName cannot exceed 50 characters.').optional(),
    phone: z.string().optional(),
    bio: z.string().max(300, 'bio cannot exceed 300 characters.').optional(),
  }),
})
