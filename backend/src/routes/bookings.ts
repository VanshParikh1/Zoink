import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/requireAuth'
import { requireVerified } from '../middleware/requiredVerified'
import { validate } from '../middleware/validate'
import { CreateBookingSchema, BookingIdParamsSchema } from '../schemas/booking.schema'
import {
  InitiateHandoffSchema,
  ZoinkTapSchema,
  UploadHandoffPhotosSchema,
  BookingIdParamsSchema as HandoffBookingIdParamsSchema,
} from '../schemas/handoff.schema'
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

// Booking CRUD
router.post('/', validate(CreateBookingSchema), createBooking)
router.get('/me', getMyBookings)
router.get('/requests', getIncomingRequests)

// Handoff / Zoink It — highest risk, validated strictly
router.post('/:id/pickup/initiate', validate(InitiateHandoffSchema), initiatePickup)
router.post('/:id/pickup/confirm', validate(HandoffBookingIdParamsSchema), confirmPickup)
router.post('/:id/return/initiate', validate(InitiateHandoffSchema), initiateReturn)
router.post('/:id/return/confirm', validate(HandoffBookingIdParamsSchema), confirmReturn)
router.post('/:id/photos', validate(UploadHandoffPhotosSchema), uploadHandoffPhotos)
router.post('/:id/photos/upload', upload.single('image'), uploadHandoffPhotoImage)
router.post('/:id/zoink-tap', validate(ZoinkTapSchema), zoinkTap)

// Read / state-transition routes (param-only)
router.get('/:id/photos', validate(HandoffBookingIdParamsSchema), getHandoffPhotos)
router.get('/:id', validate(BookingIdParamsSchema), getBooking)
router.patch('/:id/accept', validate(BookingIdParamsSchema), acceptBooking)
router.patch('/:id/decline', validate(BookingIdParamsSchema), declineBooking)
router.patch('/:id/cancel', validate(BookingIdParamsSchema), cancelBooking)
router.patch('/:id/activate', validate(BookingIdParamsSchema), activateBooking)
router.patch('/:id/complete', validate(BookingIdParamsSchema), completeBooking)

export default router
