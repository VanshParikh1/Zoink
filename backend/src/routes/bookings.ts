import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import {
  acceptBooking,
  activateBooking,
  cancelBooking,
  completeBooking,
  createBooking,
  declineBooking,
  getBooking,
  getHandoffPhotos,
  getIncomingRequests,
  getMyBookings,
  initiatePickup,
  initiateReturn,
  confirmPickup,
  confirmReturn,
  uploadHandoffPhotos,
  uploadHandoffPhotoImage,
  zoinkTap,
} from '../middleware/controllers/bookingController'

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

router.use(requireAuth, requireVerified)

router.post('/', createBooking)
router.get('/me', getMyBookings)
router.get('/requests', getIncomingRequests)
router.post('/:id/pickup/initiate', initiatePickup)
router.post('/:id/pickup/confirm', confirmPickup)
router.post('/:id/return/initiate', initiateReturn)
router.post('/:id/return/confirm', confirmReturn)
router.get('/:id/photos', getHandoffPhotos)
router.get('/:id', getBooking)
router.patch('/:id/accept', acceptBooking)
router.patch('/:id/decline', declineBooking)
router.patch('/:id/cancel', cancelBooking)
router.patch('/:id/activate', activateBooking)
router.patch('/:id/complete', completeBooking)
router.post('/:id/photos', uploadHandoffPhotos)
router.post('/:id/photos/upload', upload.single('image'), uploadHandoffPhotoImage)
router.post('/:id/zoink-tap', zoinkTap)

export default router
