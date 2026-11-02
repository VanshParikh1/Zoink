import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { PendingReviewsQuerySchema, SubmitReviewSchema } from '../schemas/review.schema'
import { getPendingReviews, submitReview } from '../middleware/controllers/reviewController'

const router = Router()

router.use(requireAuth, requireVerified)

router.get('/pending', validate(PendingReviewsQuerySchema), getPendingReviews)
router.post('/', validate(SubmitReviewSchema), submitReview)

export default router
