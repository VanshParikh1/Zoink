import { BookingEventType, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { NotFoundError } from '../utils/errors'

export async function getBookingEvents(bookingId: string, db: typeof prisma = prisma) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true } })
  if (!booking) throw new NotFoundError('Booking not found')

  return db.bookingEvent.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createBookingEvent(
  bookingId: string,
  type: BookingEventType,
  actorId: string | null,
  metadata?: any,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma
  return client.bookingEvent.create({
    data: {
      bookingId,
      type,
      actorId,
      metadata: metadata ? (metadata as any) : undefined,
    },
  })
}
