import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { getMe, getPublicProfile, updateMe, uploadAvatar } from '../middleware/controllers/userController'

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
router.patch('/me', requireAuth, updateMe)
router.post('/me/avatar', requireAuth, upload.single('avatar'), uploadAvatar)

// Public profile — must be verified to view others
router.get('/:id', requireAuth, requireVerified, getPublicProfile)

export default router
