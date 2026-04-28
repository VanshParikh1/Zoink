import { Request, Response } from 'express'
import { BookingStatus } from '@prisma/client'
import * as bookingService from '../../services/bookingService'

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
  const map: Record<string, { status: number; message: string }> = {
    LISTING_NOT_FOUND: { status: 404, message: 'Listing not found.' },
    BOOKING_NOT_FOUND: { status: 404, message: 'Booking not found.' },
    BOOKING_FORBIDDEN: { status: 403, message: 'You do not have access to this booking.' },
    BOOKING_INVALID_DATES: { status: 400, message: 'Start and end dates are invalid.' },
    BOOKING_INVALID_TRANSITION: { status: 400, message: 'That booking transition is not allowed.' },
    BOOKING_LISTING_UNAVAILABLE: { status: 400, message: 'This listing is currently unavailable.' },
    BOOKING_OVERLAP: { status: 409, message: 'Those dates overlap with another accepted booking.' },
    BOOKING_SELF: { status: 400, message: 'You cannot book your own listing.' },
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
