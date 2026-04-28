import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import {
  getConversationMessages,
  getMyConversations,
  openConversation,
  sendMessage,
} from '../middleware/controllers/conversationController'

const router = Router()

router.use(requireAuth, requireVerified)

router.post('/', openConversation)
router.get('/me', getMyConversations)
router.get('/:id/messages', getConversationMessages)
router.post('/:id/messages', sendMessage)

export default router
