import { BookingStatus } from '@prisma/client'

const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'CANCELLED'],
  ACCEPTED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PICKUP_PENDING', 'ACTIVE', 'CANCELLED'],
  DECLINED: [],
  PICKUP_PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['RETURN_PENDING', 'COMPLETED'],
  RETURN_PENDING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function assertBookingTransition(currentStatus: BookingStatus, nextStatus: BookingStatus) {
  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new Error('BOOKING_INVALID_TRANSITION')
  }
}
