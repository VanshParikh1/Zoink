import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import {
  browseListings,
  createListing,
  getListingCategories,
  getListing,
  getMyListings,
  updateListing,
  toggleAvailability,
  deleteListing,
  uploadListingImage,
  deleteListingImage,
} from '../middleware/controllers/listingController'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed.'))
    }
  },
})

router.get('/me', requireAuth, requireVerified, getMyListings)
router.get('/', requireAuth, requireVerified, browseListings)
router.get('/categories', requireAuth, requireVerified, getListingCategories)
router.get('/:id', requireAuth, requireVerified, getListing)

router.post('/', requireAuth, requireVerified, createListing)
router.patch('/:id', requireAuth, requireVerified, updateListing)
router.patch('/:id/availability', requireAuth, requireVerified, toggleAvailability)
router.delete('/:id', requireAuth, requireVerified, deleteListing)
router.post('/:id/images', requireAuth, requireVerified, upload.single('image'), uploadListingImage)
router.delete('/:id/images/:imageId', requireAuth, requireVerified, deleteListingImage)

export default router
