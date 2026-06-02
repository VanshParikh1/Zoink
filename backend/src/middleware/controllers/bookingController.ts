import { Request, Response } from 'express'
import { BookingStatus } from '@prisma/client'
import * as bookingService from '../../services/bookingService'
import * as handoffService from '../../services/handoffService'
import { uploadImage } from '../../utils/cloudinary'

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
  const map: Record<string, { status: number; message: string }> = {
    LISTING_NOT_FOUND: { status: 404, message: 'Listing not found.' },
    BOOKING_NOT_FOUND: { status: 404, message: 'Booking not found.' },
    BOOKING_FORBIDDEN: { status: 403, message: 'You do not have access to this booking.' },
    BOOKING_INVALID_DATES: { status: 400, message: 'Start and end dates are invalid.' },
    BOOKING_INVALID_TRANSITION: { status: 400, message: 'That booking transition is not allowed.' },
    BOOKING_VERSION_CONFLICT: { status: 409, message: 'This booking was updated by someone else. Please refresh and try again.' },
    BOOKING_LISTING_UNAVAILABLE: { status: 400, message: 'This listing is currently unavailable.' },
    BOOKING_OVERLAP: { status: 409, message: 'Those dates overlap with another accepted booking.' },
    BOOKING_SELF: { status: 400, message: 'You cannot book your own listing.' },
    OWNER_STRIPE_ACCOUNT_REQUIRED: { status: 409, message: 'The owner needs to connect Stripe before accepting bookings.' },
    PAYMENT_NOT_AUTHORIZED: { status: 409, message: 'Payment authorization is not ready yet.' },
    PAYMENT_INTENT_MISSING: { status: 409, message: 'Payment authorization is missing.' },
    HANDOFF_PHOTOS_REQUIRED: { status: 400, message: 'Upload handoff photos before tapping Zoink It.' },
    HANDOFF_PHOTOS_COUNT: { status: 400, message: 'photos must contain 2 to 3 Cloudinary URLs.' },
    HANDOFF_PHOTOS_NOT_COMPLETED: { status: 403, message: 'Photos are only available after the rental is completed' },
    BOOKING_OWNER_ONLY: { status: 403, message: 'Only the booking owner can initiate pickup.' },
    BOOKING_RENTER_ONLY: { status: 403, message: 'Only the booking renter can initiate return.' },
  }

  const mapped = map[message]
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message })
  }

  console.error('Unhandled booking error:', error)
  return res.status(500).json({ error: 'Something went wrong.' })
}

export async function createBooking(req: Request, res: Response) {
  const renterId = (req as any).userId as string
  const { listingId, startDate, endDate, message } = req.body

  if (!listingId || !startDate || !endDate) {
    return res.status(400).json({ error: 'listingId, startDate, and endDate are required.' })
  }

  try {
    const booking = await bookingService.createBooking(renterId, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      message,
      insuranceOptIn: Boolean(req.body.insuranceOptIn),
    })

    return res.status(201).json(booking)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function getBooking(req: Request, res: Response) {
  const userId = (req as any).userId as string
  const bookingId = req.params.id as string

  try {
    const booking = await bookingService.getBookingById(bookingId, userId)
    return res.json(booking)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function getMyBookings(req: Request, res: Response) {
  const renterId = (req as any).userId as string

  try {
    const bookings = await bookingService.getMyBookings(renterId)
    return res.json(bookings)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function getIncomingRequests(req: Request, res: Response) {
  const ownerId = (req as any).userId as string

  try {
    const bookings = await bookingService.getIncomingRequests(ownerId)
    return res.json(bookings)
  } catch (error) {
    return handleError(res, error)
  }
}

async function transitionBooking(req: Request, res: Response, status: BookingStatus) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  try {
    const booking = await bookingService.transitionBookingStatus(bookingId, actorId, status)
    return res.json(booking)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function acceptBooking(req: Request, res: Response) {
  return transitionBooking(req, res, 'ACCEPTED')
}

export async function declineBooking(req: Request, res: Response) {
  return transitionBooking(req, res, 'DECLINED')
}

export async function cancelBooking(req: Request, res: Response) {
  return transitionBooking(req, res, 'CANCELLED')
}

export async function activateBooking(req: Request, res: Response) {
  return transitionBooking(req, res, 'ACTIVE')
}

export async function completeBooking(req: Request, res: Response) {
  return transitionBooking(req, res, 'COMPLETED')
}

function parsePhase(value: unknown) {
  return value === 'pickup' || value === 'return' ? value : null
}

export async function uploadHandoffPhotos(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string
  const phase = parsePhase(req.body.phase)

  if (!phase) {
    return res.status(400).json({ error: 'phase must be pickup or return.' })
  }

  try {
    const booking = await handoffService.uploadHandoffPhotos(bookingId, actorId, phase, req.body.photoUrls ?? req.body.photos)
    return res.json(booking)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function initiatePickup(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  try {
    const booking = await handoffService.initiateHandoff(bookingId, actorId, 'pickup', req.body.photos)
    return res.json(booking)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function confirmPickup(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  try {
    const result = await handoffService.confirmHandoff(bookingId, actorId, 'pickup')
    return res.json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function initiateReturn(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  try {
    const booking = await handoffService.initiateHandoff(bookingId, actorId, 'return', req.body.photos)
    return res.json(booking)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function confirmReturn(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  try {
    const result = await handoffService.confirmHandoff(bookingId, actorId, 'return')
    return res.json(result)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function getHandoffPhotos(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  try {
    const photos = await handoffService.getCompletedHandoffPhotos(bookingId, actorId)
    return res.json(photos)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function uploadHandoffPhotoImage(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' })
  }

  try {
    const publicId = `booking_${bookingId}_${Date.now()}`
    const url = await uploadImage(req.file.buffer, 'bookings', publicId)
    return res.status(201).json({ url })
  } catch (error) {
    return handleError(res, error)
  }
}

export async function zoinkTap(req: Request, res: Response) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string
  const phase = parsePhase(req.body.phase)

  if (!phase) {
    return res.status(400).json({ error: 'phase must be pickup or return.' })
  }

  try {
    const booking = await handoffService.registerTap(bookingId, actorId, phase)
    return res.json(booking)
  } catch (error) {
    return handleError(res, error)
  }
}
