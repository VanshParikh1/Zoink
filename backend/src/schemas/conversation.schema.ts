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

// ── POST /conversations ───────────────────────────────────────────────────────

export const OpenConversationSchema = z.object({
  body: z.object({
    listingId: z.string().min(1, 'listingId is required.'),
  }),
})

// ── GET /conversations/:id, POST /conversations/:id/read ──────────────────────

export const ConversationIdParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Conversation ID must be a valid UUID.'),
  }),
})

// ── GET /conversations/:id/messages ───────────────────────────────────────────

export const GetMessagesSchema = z.object({
  params: z.object({
    id: z.string().uuid('Conversation ID must be a valid UUID.'),
  }),
  query: z.object({
    // Forward-polling cursor: the id of the newest message the client has.
    after: z.string().uuid('after must be a message id.').optional(),
  }),
})
