import { Router } from 'express'
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
  getIncomingRequests,
  getMyBookings,
  uploadHandoffPhotos,
  zoinkTap,
} from '../middleware/controllers/bookingController'

const router = Router()

router.use(requireAuth, requireVerified)

router.post('/', createBooking)
router.get('/me', getMyBookings)
router.get('/requests', getIncomingRequests)
router.get('/:id', getBooking)
router.patch('/:id/accept', acceptBooking)
router.patch('/:id/decline', declineBooking)
router.patch('/:id/cancel', cancelBooking)
router.patch('/:id/activate', activateBooking)
router.patch('/:id/complete', completeBooking)
router.post('/:id/photos', uploadHandoffPhotos)
router.post('/:id/zoink-tap', zoinkTap)

export default router
