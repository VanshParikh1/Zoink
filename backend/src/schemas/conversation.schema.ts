import { z } from 'zod'

/**
 * Conversation / messaging schemas.
 */

// ── POST /conversations/:id/messages ──────────────────────────────────────────

export const SendMessageSchema = z.object({
  params: z.object({
    id: z.string().uuid('Conversation ID must be a valid UUID.'),
  }),
  body: z.object({
    body: z.string().max(2000, 'Message cannot exceed 2000 characters.'),
  }),
})
