import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { SendMessageSchema } from '../schemas/conversation.schema'
import {
  getConversationMessages,
  getMyConversations,
  markConversationRead,
  openConversation,
  sendMessage,
} from '../middleware/controllers/conversationController'

const router = Router()

router.use(requireAuth, requireVerified)

router.post('/', openConversation)
router.get('/me', getMyConversations)
router.get('/:id/messages', getConversationMessages)
router.post('/:id/messages', validate(SendMessageSchema), sendMessage)
router.post('/:id/read', markConversationRead)

export default router
