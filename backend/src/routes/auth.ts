import { Router } from 'express'
import { register, login, verifyEmail, resendOTP } from '../middleware/controllers/authController'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.post('/verify-email', requireAuth, verifyEmail)
router.post('/resend-otp', requireAuth, resendOTP)

export default router
