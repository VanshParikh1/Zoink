import { BookingEventType, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'
import { NotFoundError } from '../utils/errors'
import { createdAtAfter, createdAtKey, createdAtOrder, LEGACY_LIST_CAP, pageSize, splitPage, type PageParams } from '../utils/pagination'

// Oldest first (a timeline). Unpaginated for builds from before pagination, capped.
export async function getBookingEvents(bookingId: string, db: typeof prisma = prisma) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true } })
  if (!booking) throw new NotFoundError('Booking not found')

  return db.bookingEvent.findMany({
    where: { bookingId },
    orderBy: createdAtOrder('asc'),
    take: LEGACY_LIST_CAP,
  })
}

export async function listBookingEventsPage(bookingId: string, params: PageParams) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } })
  if (!booking) throw new NotFoundError('Booking not found')

  const size = pageSize(params)
  const events = await prisma.bookingEvent.findMany({
    where: { bookingId, ...createdAtAfter(params.cursor, 'asc') },
    orderBy: createdAtOrder('asc'),
    take: size + 1,
  })
  return splitPage(events, size, createdAtKey)
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
