import { Router } from 'express'
import multer from 'multer'
import { BadRequestError } from '../utils/errors'
import { requireAuth, requireAuthAllowingExpired } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { blockLimiter, uploadLimiter } from '../middleware/rateLimiter'
import { ReleasePushTokenSchema, UpdateMeSchema, UpdateNotificationPrefsSchema, UpdatePushTokenSchema, UserIdParamsSchema } from '../schemas/user.schema'
import {
  getMe,
  getPublicProfile,
  updateMe,
  updateNotificationPrefs,
  deleteMe,
  updatePushToken,
  releasePushToken,
  uploadAvatar,
  onboardStripeConnect,
  getStripeConnectStatus,
  acceptTerms,
  blockUser,
  unblockUser,
  getMyBlocks,
} from '../middleware/controllers/userController'

const router = Router()

// Multer — store file in memory (we stream straight to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new BadRequestError('Only image files are allowed.'))
    }
  },
})

// Own profile. An account isn't active until its email is verified: before
// that it can read and delete itself, verify (routes/auth.ts) and release its
// push token on sign-out, nothing else.
router.get('/me', requireAuth, getMe)
router.patch('/me', requireAuth, requireVerified, validate(UpdateMeSchema), updateMe)
router.delete('/me', requireAuth, deleteMe)
router.patch('/me/notification-prefs', requireAuth, requireVerified, validate(UpdateNotificationPrefsSchema), updateNotificationPrefs)
router.post('/me/accept-terms', requireAuth, requireVerified, acceptTerms)
router.patch('/me/push-token', requireAuth, requireVerified, validate(UpdatePushTokenSchema), updatePushToken)
router.post('/me/push-token/release', requireAuthAllowingExpired, validate(ReleasePushTokenSchema), releasePushToken)
router.post('/me/avatar', requireAuth, requireVerified, uploadLimiter, upload.single('avatar'), uploadAvatar)
// Payout onboarding creates a real Stripe Connect account — verified students only.
router.post('/me/stripe-connect/onboard', requireAuth, requireVerified, onboardStripeConnect)
router.get('/me/stripe-connect/status', requireAuth, requireVerified, getStripeConnectStatus)
router.get('/me/blocks', requireAuth, requireVerified, getMyBlocks)

// Blocking. Verified only, like everything else: an unverified account has no
// conversations, listings or bookings, so nobody can reach it to block.
router.post('/:id/block', requireAuth, requireVerified, blockLimiter, validate(UserIdParamsSchema), blockUser)
router.delete('/:id/block', requireAuth, requireVerified, blockLimiter, validate(UserIdParamsSchema), unblockUser)

// Public profile — must be verified to view others
router.get('/:id', requireAuth, requireVerified, validate(UserIdParamsSchema), getPublicProfile)

export default router
