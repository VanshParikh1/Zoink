import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { getPendingReviews, submitReview } from '../middleware/controllers/reviewController'

const router = Router()

router.use(requireAuth, requireVerified)

router.get('/pending', getPendingReviews)
router.post('/', submitReview)

export default router
