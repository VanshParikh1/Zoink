import { Router } from 'express'
import { register, login, verifyEmail, resendOTP, getLegalVersion } from '../middleware/controllers/authController'
import { requireAuth } from '../middleware/requireAuth'
import { validate } from '../middleware/validate'
import {
  authLimiter,
  loginAccountLimiter,
  loginAddressLimiter,
  registerLimiter,
  verificationEmailAddressLimiter,
} from '../middleware/rateLimiter'
import { RegisterSchema, LoginSchema, VerifyEmailSchema } from '../schemas/auth.schema'

const router = Router()

// Brute-force/spam targets — every route here is rate-limited, ahead of
// validation and auth so rejected attempts count too.
router.get('/legal-version', authLimiter, getLegalVersion)
router.post('/register', registerLimiter, verificationEmailAddressLimiter, validate(RegisterSchema), register)
router.post('/login', loginAddressLimiter, loginAccountLimiter, validate(LoginSchema), login)
router.post('/verify-email', authLimiter, requireAuth, validate(VerifyEmailSchema), verifyEmail)
router.post('/resend-otp', authLimiter, verificationEmailAddressLimiter, requireAuth, resendOTP)

export default router
