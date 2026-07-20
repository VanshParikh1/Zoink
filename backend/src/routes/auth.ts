import { Router } from 'express'
import { register, login, verifyEmail, resendOTP } from '../middleware/controllers/authController'
import { requireAuth } from '../middleware/requireAuth'
import { validate } from '../middleware/validate'
import { RegisterSchema, LoginSchema, VerifyEmailSchema } from '../schemas/auth.schema'

const router = Router()

router.post('/register', validate(RegisterSchema), register)
router.post('/login', validate(LoginSchema), login)
router.post('/verify-email', requireAuth, validate(VerifyEmailSchema), verifyEmail)
router.post('/resend-otp', requireAuth, resendOTP)

export default router
