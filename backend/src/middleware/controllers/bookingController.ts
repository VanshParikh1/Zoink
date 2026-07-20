import { Request, Response } from 'express'
import { BookingStatus } from '@prisma/client'
import * as bookingService from '../../services/bookingService'
import * as handoffService from '../../services/handoffService'
import { uploadImage } from '../../utils/cloudinary'
import { asyncHandler } from '../../utils/asyncHandler'

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  const renterId = (req as any).userId as string
  const { listingId, startDate, endDate, message, insuranceOptIn } = req.body

  const booking = await bookingService.createBooking(renterId, {
    listingId,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    message,
    insuranceOptIn: Boolean(insuranceOptIn),
  })

  return res.status(201).json(booking)
})

export const getBooking = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string
  const bookingId = req.params.id as string

  const booking = await bookingService.getBookingById(bookingId, userId)
  return res.json(booking)
})

export const getMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const renterId = (req as any).userId as string

  const bookings = await bookingService.getMyBookings(renterId)
  return res.json(bookings)
})

export const getIncomingRequests = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).userId as string

  const bookings = await bookingService.getIncomingRequests(ownerId)
  return res.json(bookings)
})

async function transitionBooking(req: Request, res: Response, status: BookingStatus) {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  const booking = await bookingService.transitionBookingStatus(bookingId, actorId, status)
  return res.json(booking)
}

export const acceptBooking = asyncHandler(async (req: Request, res: Response) => {
  return transitionBooking(req, res, 'ACCEPTED')
})

export const declineBooking = asyncHandler(async (req: Request, res: Response) => {
  return transitionBooking(req, res, 'DECLINED')
})

export const cancelBooking = asyncHandler(async (req: Request, res: Response) => {
  return transitionBooking(req, res, 'CANCELLED')
})

export const activateBooking = asyncHandler(async (req: Request, res: Response) => {
  return transitionBooking(req, res, 'ACTIVE')
})

export const completeBooking = asyncHandler(async (req: Request, res: Response) => {
  return transitionBooking(req, res, 'COMPLETED')
})


export const uploadHandoffPhotos = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string
  const phase = req.body.phase as 'pickup' | 'return'

  const booking = await handoffService.uploadHandoffPhotos(bookingId, actorId, phase, req.body.photoUrls ?? req.body.photos)
  return res.json(booking)
})

export const initiatePickup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  const booking = await handoffService.initiateHandoff(bookingId, actorId, 'pickup', req.body.photos)
  return res.json(booking)
})

export const confirmPickup = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  const result = await handoffService.confirmHandoff(bookingId, actorId, 'pickup')
  return res.json(result)
})

export const initiateReturn = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  const booking = await handoffService.initiateHandoff(bookingId, actorId, 'return', req.body.photos)
  return res.json(booking)
})

export const confirmReturn = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  const result = await handoffService.confirmHandoff(bookingId, actorId, 'return')
  return res.json(result)
})

export const getHandoffPhotos = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  const photos = await handoffService.getCompletedHandoffPhotos(bookingId, actorId)
  return res.json(photos)
})

export const uploadHandoffPhotoImage = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string

  if (!req.file) {
    return res.status(400).json({ error: 'No image file provided.' })
  }

  const publicId = `booking_${bookingId}_${Date.now()}`
  const url = await uploadImage(req.file.buffer, 'bookings', publicId)
  return res.status(201).json({ url })
})

export const zoinkTap = asyncHandler(async (req: Request, res: Response) => {
  const actorId = (req as any).userId as string
  const bookingId = req.params.id as string
  const phase = req.body.phase as 'pickup' | 'return'

  const booking = await handoffService.registerTap(bookingId, actorId, phase)
  return res.json(booking)
})
