import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import {
  createListing,
  getListing,
  getMyListings,
  updateListing,
  toggleAvailability,
  deleteListing,
  uploadListingImage,
  deleteListingImage,
} from '../middleware/controllers/listingController'

const router = Router()

// Multer — memory storage, stream straight to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max per listing photo
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed.'))
    }
  },
})

// ── Own listings (owner dashboard) ───────────────────────────────────────────
router.get('/me', requireAuth, requireVerified, getMyListings)

// ── Single listing detail (any verified user) ─────────────────────────────────
router.get('/:id', requireAuth, requireVerified, getListing)

// ── Create listing ────────────────────────────────────────────────────────────
router.post('/', requireAuth, requireVerified, createListing)

// ── Update listing fields ─────────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireVerified, updateListing)

// ── Toggle availability ───────────────────────────────────────────────────────
router.patch('/:id/availability', requireAuth, requireVerified, toggleAvailability)

// ── Delete listing ────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireVerified, deleteListing)

// ── Upload a photo to a listing ───────────────────────────────────────────────
router.post('/:id/images', requireAuth, requireVerified, upload.single('image'), uploadListingImage)

// ── Delete a photo from a listing ────────────────────────────────────────────
router.delete('/:id/images/:imageId', requireAuth, requireVerified, deleteListingImage)

export default router
