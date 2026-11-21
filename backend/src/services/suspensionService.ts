import { Role } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, NotFoundError } from '../utils/errors'

// D-9: a suspended user can't create listings, bookings, conversations,
// reports or disputes (middleware/requireNotSuspended.ts), or send messages
// except in a chat with a CONFIRMED..RETURN_PENDING booking (sendMessage), and their
// listings are hidden from browse (listingService). They can still sign in,
// read their data and finish existing bookings: handoffs, the return, reviews.

export type SuspensionOutcome = { userId: string; email: string; suspendedAt: Date | null; changed: boolean }

export async function suspendUser(userId: string, db: typeof prisma = prisma): Promise<SuspensionOutcome> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true, suspendedAt: true, deletedAt: true } })
  if (!user || user.deletedAt) throw new NotFoundError('User not found.')
  // An admin who could be suspended could be locked out of the admin tools.
  if (user.role === Role.ADMIN) throw new BadRequestError('Revoke admin access before suspending this account.')
  if (user.suspendedAt) return { userId: user.id, email: user.email, suspendedAt: user.suspendedAt, changed: false }
  const updated = await db.user.update({ where: { id: userId }, data: { suspendedAt: new Date() }, select: { suspendedAt: true } })
  return { userId: user.id, email: user.email, suspendedAt: updated.suspendedAt, changed: true }
}

export async function unsuspendUser(userId: string, db: typeof prisma = prisma): Promise<SuspensionOutcome> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, suspendedAt: true, deletedAt: true } })
  if (!user || user.deletedAt) throw new NotFoundError('User not found.')
  if (!user.suspendedAt) return { userId: user.id, email: user.email, suspendedAt: null, changed: false }
  await db.user.update({ where: { id: userId }, data: { suspendedAt: null } })
  return { userId: user.id, email: user.email, suspendedAt: null, changed: true }
}

/** True when the listing's owner is suspended (the listing is then hidden and
 *  can't be booked or messaged about). */
export async function isListingOwnerSuspended(ownerId: string, db: typeof prisma = prisma): Promise<boolean> {
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { suspendedAt: true } })
  return Boolean(owner?.suspendedAt)
}
