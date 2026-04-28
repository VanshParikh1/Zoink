import { BookingStatus } from '@prisma/client'

const allowedTransitions: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['ACCEPTED', 'DECLINED', 'CANCELLED'],
  ACCEPTED: ['ACTIVE', 'CANCELLED'],
  DECLINED: [],
  ACTIVE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

export function assertBookingTransition(currentStatus: BookingStatus, nextStatus: BookingStatus) {
  if (!allowedTransitions[currentStatus].includes(nextStatus)) {
    throw new Error('BOOKING_INVALID_TRANSITION')
  }
}
