import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { reportLimiter } from '../middleware/rateLimiter'
import { CreateReportSchema } from '../schemas/report.schema'
import * as reportController from '../middleware/controllers/reportController'

const router = Router()

// All report routes require auth and verified status
router.use(requireAuth, requireVerified)

router.post('/', reportLimiter, validate(CreateReportSchema), reportController.createReport)

export default router
