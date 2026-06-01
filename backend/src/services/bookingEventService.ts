import { BookingEventType, Prisma } from '@prisma/client'
import prisma from '../utils/prisma'

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
