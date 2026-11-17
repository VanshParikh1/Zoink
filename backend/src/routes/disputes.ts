import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { requireNotSuspended } from '../middleware/requireNotSuspended'
import { validate } from '../middleware/validate'
import { disputeLimiter } from '../middleware/rateLimiter'
import { CreateDisputeSchema, DisputeIdParamsSchema, MyDisputesQuerySchema } from '../schemas/dispute.schema'
import * as disputeController from '../middleware/controllers/disputeController'

const router = Router()

// All user dispute routes require auth and verified status
router.use(requireAuth, requireVerified)

router.post('/', requireNotSuspended, disputeLimiter, validate(CreateDisputeSchema), disputeController.createDispute)
router.get('/', validate(MyDisputesQuerySchema), disputeController.getMyDisputes)
router.get('/:id', validate(DisputeIdParamsSchema), disputeController.getDispute)

export default router
