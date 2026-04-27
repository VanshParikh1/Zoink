import { BookingStatus, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { assertBookingTransition } from '../middleware/bookingStateMachine'

const bookingInclude = {
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
} satisfies Prisma.BookingInclude

const BOOKING_DEPOSIT_RATE = 0.3

export type CreateBookingInput = {
  listingId: string
  startDate: Date
  endDate: Date
  message?: string
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function toBookingResponse(booking: any) {
  return {
    ...booking,
    totalPrice: Number(booking.totalPrice),
    depositAmount: Number(booking.depositAmount ?? 0),
  }
}

function getRentalDays(startDate: Date, endDate: Date) {
  const msPerDay = 1000 * 60 * 60 * 24
  const normalizedStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  const normalizedEnd = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  const diffDays = Math.round((normalizedEnd - normalizedStart) / msPerDay)
  return diffDays + 1
}

function ensureValidBookingDates(startDate: Date, endDate: Date) {
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('BOOKING_INVALID_DATES')
  }

  if (endDate < startDate) {
    throw new Error('BOOKING_INVALID_DATES')
  }
}

async function getBookingForParticipant(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude as any,
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
  const depositAmount = roundCurrency(totalPrice * BOOKING_DEPOSIT_RATE)

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId,
      ownerId: listing.ownerId,
      startDate: input.startDate,
      endDate: input.endDate,
      totalPrice: new Prisma.Decimal(totalPrice),
      depositAmount: new Prisma.Decimal(depositAmount),
      message: input.message?.trim() || null,
    } as any,
    include: bookingInclude as any,
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
    include: bookingInclude as any,
    orderBy: { createdAt: 'desc' },
  })

  return bookings.map((booking: any) => toBookingResponse(booking))
}

export async function getIncomingRequests(ownerId: string) {
  const bookings = await prisma.booking.findMany({
    where: { ownerId },
    include: bookingInclude as any,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })

  return bookings.map((booking: any) => toBookingResponse(booking))
}

export async function transitionBookingStatus(bookingId: string, actorId: string, nextStatus: BookingStatus) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude as any,
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
    include: bookingInclude as any,
  })

  return toBookingResponse(updated)
}
