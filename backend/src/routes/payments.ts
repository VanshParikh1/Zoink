import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import {
  initiateConnectAccount,
  connectAccountCallback,
} from '../middleware/controllers/paymentController'
import { stripeWebhook } from '../middleware/controllers/stripeWebhookController'

const router = Router()

// Public callback (returns HTML page)
router.get('/connect-account/callback', connectAccountCallback)

// Public webhook endpoint (invoked by Stripe)
router.post('/webhook', stripeWebhook)

// Protected Connect onboarding
router.post('/connect-account', requireAuth, initiateConnectAccount)

export default router
