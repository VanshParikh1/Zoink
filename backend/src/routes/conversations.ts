import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { conversationOpenLimiter, messageLimiter } from '../middleware/rateLimiter'
import { ConversationIdParamsSchema, GetMessagesSchema, InboxQuerySchema, OpenConversationSchema, SendMessageSchema } from '../schemas/conversation.schema'
import {
  getConversationById,
  getConversationMessages,
  getMyConversations,
  markConversationRead,
  openConversation,
  sendMessage,
} from '../middleware/controllers/conversationController'

const router = Router()

router.use(requireAuth, requireVerified)

router.post('/', conversationOpenLimiter, validate(OpenConversationSchema), openConversation)
router.get('/me', validate(InboxQuerySchema), getMyConversations)
router.get('/:id', validate(ConversationIdParamsSchema), getConversationById)
router.get('/:id/messages', validate(GetMessagesSchema), getConversationMessages)
router.post('/:id/messages', messageLimiter, validate(SendMessageSchema), sendMessage)
router.post('/:id/read', validate(ConversationIdParamsSchema), markConversationRead)

export default router
