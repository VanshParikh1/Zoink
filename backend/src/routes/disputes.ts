import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { CreateDisputeSchema, DisputeIdParamsSchema } from '../schemas/dispute.schema'
import * as disputeController from '../middleware/controllers/disputeController'

const router = Router()

// All user dispute routes require auth and verified status
router.use(requireAuth, requireVerified)

router.post('/', validate(CreateDisputeSchema), disputeController.createDispute)
router.get('/', disputeController.getMyDisputes)
router.get('/:id', validate(DisputeIdParamsSchema), disputeController.getDispute)

export default router
