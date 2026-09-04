import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { UpdateMeSchema, UpdateNotificationPrefsSchema } from '../schemas/user.schema'
import {
  getMe,
  getPublicProfile,
  updateMe,
  updateNotificationPrefs,
  deleteMe,
  updatePushToken,
  uploadAvatar,
  onboardStripeConnect,
  getStripeConnectStatus,
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
      cb(new Error('Only image files are allowed.'))
    }
  },
})

// Own profile
router.get('/me', requireAuth, getMe)
router.patch('/me', requireAuth, validate(UpdateMeSchema), updateMe)
router.delete('/me', requireAuth, deleteMe)
router.patch('/me/notification-prefs', requireAuth, validate(UpdateNotificationPrefsSchema), updateNotificationPrefs)
router.patch('/me/push-token', requireAuth, updatePushToken)
router.post('/me/avatar', requireAuth, upload.single('avatar'), uploadAvatar)
router.post('/me/stripe-connect/onboard', requireAuth, onboardStripeConnect)
router.get('/me/stripe-connect/status', requireAuth, getStripeConnectStatus)

// Public profile — must be verified to view others
router.get('/:id', requireAuth, requireVerified, getPublicProfile)

export default router
