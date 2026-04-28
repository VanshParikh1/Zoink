import { BookingStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { assertBookingTransition } from '../middleware/bookingStateMachine'
import {
  BOOKING_DEPOSIT_RATE,
  calculateDepositAmount,
  ensureValidBookingDates,
  getRentalDays,
  roundCurrency,
} from './bookingUtils'

const bookingSelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  totalPrice: true,
  message: true,
  renterId: true,
  ownerId: true,
  listingId: true,
  createdAt: true,
  updatedAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      category: true,
      dailyPrice: true,
      city: true,
      address: true,
      isAvailable: true,
      images: {
        select: { id: true, url: true, order: true },
        orderBy: { order: 'asc' as const },
      },
    },
  },
  renter: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
} satisfies Prisma.BookingSelect

export type CreateBookingInput = {
  listingId: string
  startDate: Date
  endDate: Date
  message?: string
}

function toBookingResponse(booking: any) {
  const totalPrice = Number(booking.totalPrice)
  return {
    ...booking,
    totalPrice,
    depositAmount: calculateDepositAmount(totalPrice),
  }
}

async function getBookingForParticipant(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) {
    throw new Error('BOOKING_NOT_FOUND')
  }

  if (booking.renterId !== userId && booking.ownerId !== userId) {
    throw new Error('BOOKING_FORBIDDEN')
  }

  return booking
}

async function ensureNoOverlap(listingId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, startDate: true, endDate: true },
  })

  if (!booking) {
    throw new Error('BOOKING_NOT_FOUND')
  }

  const overlapping = await prisma.booking.findFirst({
    where: {
      listingId,
      id: { not: bookingId },
      status: { in: ['ACCEPTED', 'ACTIVE'] },
      startDate: { lte: booking.endDate },
      endDate: { gte: booking.startDate },
    },
    select: { id: true },
  })

  if (overlapping) {
    throw new Error('BOOKING_OVERLAP')
  }
}

export async function createBooking(renterId: string, input: CreateBookingInput) {
  ensureValidBookingDates(input.startDate, input.endDate)

  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true,
      ownerId: true,
      isAvailable: true,
      dailyPrice: true,
    },
  })

  if (!listing) {
    throw new Error('LISTING_NOT_FOUND')
  }

  if (listing.ownerId === renterId) {
    throw new Error('BOOKING_SELF')
  }

  if (!listing.isAvailable) {
    throw new Error('BOOKING_LISTING_UNAVAILABLE')
  }

  const rentalDays = getRentalDays(input.startDate, input.endDate)

  if (rentalDays <= 0) {
    throw new Error('BOOKING_INVALID_DATES')
  }

  const dailyPrice = Number(listing.dailyPrice)
  const totalPrice = roundCurrency(dailyPrice * rentalDays)
  const depositAmount = calculateDepositAmount(totalPrice)

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId,
      ownerId: listing.ownerId,
      startDate: input.startDate,
      endDate: input.endDate,
      totalPrice: new Prisma.Decimal(totalPrice),
      message: input.message?.trim() || null,
    } as any,
    select: bookingSelect as any,
  })

  return toBookingResponse(booking)
}

export async function getBookingById(bookingId: string, userId: string) {
  const booking = await getBookingForParticipant(bookingId, userId)
  return toBookingResponse(booking)
}

export async function getMyBookings(renterId: string) {
  const bookings = await prisma.booking.findMany({
    where: { renterId },
    select: bookingSelect as any,
    orderBy: { createdAt: 'desc' },
  })

  return bookings.map((booking: any) => toBookingResponse(booking))
}

export async function getIncomingRequests(ownerId: string) {
  const bookings = await prisma.booking.findMany({
    where: { ownerId },
    select: bookingSelect as any,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return bookings.map((booking: any) => toBookingResponse(booking))
}

export async function transitionBookingStatus(bookingId: string, actorId: string, nextStatus: BookingStatus) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingSelect as any,
  })

  if (!booking) {
    throw new Error('BOOKING_NOT_FOUND')
  }

  const isOwner = booking.ownerId === actorId
  const isRenter = booking.renterId === actorId

  if (!isOwner && !isRenter) {
    throw new Error('BOOKING_FORBIDDEN')
  }

  if (nextStatus === 'ACCEPTED' || nextStatus === 'DECLINED' || nextStatus === 'ACTIVE' || nextStatus === 'COMPLETED') {
    if (!isOwner) {
      throw new Error('BOOKING_FORBIDDEN')
    }
  }

  if (nextStatus === 'CANCELLED' && !isOwner && !isRenter) {
    throw new Error('BOOKING_FORBIDDEN')
  }

  assertBookingTransition(booking.status, nextStatus)

  if (nextStatus === 'ACCEPTED') {
    await ensureNoOverlap(booking.listingId, booking.id)
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status: nextStatus },
    select: bookingSelect as any,
  })

  return toBookingResponse(updated)
}
