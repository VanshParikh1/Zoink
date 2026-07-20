import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import {
  CreateListingSchema,
  UpdateListingSchema,
  ToggleAvailabilitySchema,
  BrowseListingsQuerySchema,
  ListingIdParamsSchema,
  ListingImageParamsSchema,
} from '../schemas/listing.schema'
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
router.get('/', requireAuth, requireVerified, validate(BrowseListingsQuerySchema), browseListings)
router.get('/categories', requireAuth, requireVerified, getListingCategories)
router.get('/:id', requireAuth, requireVerified, validate(ListingIdParamsSchema), getListing)

router.post('/', requireAuth, requireVerified, validate(CreateListingSchema), createListing)
router.patch('/:id', requireAuth, requireVerified, validate(UpdateListingSchema), updateListing)
router.patch('/:id/availability', requireAuth, requireVerified, validate(ToggleAvailabilitySchema), toggleAvailability)
router.delete('/:id', requireAuth, requireVerified, validate(ListingIdParamsSchema), deleteListing)
router.post('/:id/images', requireAuth, requireVerified, validate(ListingIdParamsSchema), upload.single('image'), uploadListingImage)
router.delete('/:id/images/:imageId', requireAuth, requireVerified, validate(ListingImageParamsSchema), deleteListingImage)

export default router
