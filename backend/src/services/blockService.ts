import { Prisma } from '@prisma/client'
import type { BlockedUserResponse } from '@zoink/shared'
import prisma from '../utils/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors'

// Blocking is symmetric in effect: a UserBlock row in EITHER direction hides
// the two users' listings and profiles from each other and stops them from
// messaging or booking one another. Only the blocker can see / undo the block
// (GET/DELETE /users/:id/block); the blocked user is never told.

export async function blockUser(blockerId: string, blockedId: string, db: typeof prisma = prisma): Promise<void> {
  if (blockerId === blockedId) throw new BadRequestError('You cannot block yourself.')

  const target = await db.user.findUnique({ where: { id: blockedId }, select: { id: true } })
  if (!target) throw new NotFoundError('User not found.')

  // Idempotent — re-blocking an already-blocked user is a no-op.
  await db.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  })
}

export async function unblockUser(blockerId: string, blockedId: string, db: typeof prisma = prisma): Promise<void> {
  // deleteMany so unblocking someone who isn't blocked is a no-op, not a 404.
  await db.userBlock.deleteMany({ where: { blockerId, blockedId } })
}

export async function listMyBlocks(blockerId: string, db: typeof prisma = prisma): Promise<BlockedUserResponse[]> {
  const blocks = await db.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      blocked: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
    },
  })

  return blocks.map((block) => ({
    ...block.blocked,
    blockedAt: block.createdAt.toISOString(),
  }))
}

export async function isBlockedBetween(userA: string, userB: string, db: typeof prisma = prisma): Promise<boolean> {
  if (userA === userB) return false
  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { id: true },
  })
  return block !== null
}

export async function assertNotBlocked(userA: string, userB: string, db: typeof prisma = prisma): Promise<void> {
  if (await isBlockedBetween(userA, userB, db)) {
    throw new ForbiddenError('You can no longer interact with this user.')
  }
}

// Every user on the other side of a block with userId, in either direction.
export async function getBlockedUserIds(userId: string, db: typeof prisma = prisma): Promise<string[]> {
  const rows = await db.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  })
  return rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId))
}

// Raw-SQL predicate for listingService.browseListings: true when the listing
// alias `l`'s owner and the viewer have no block between them.
export function listingOwnerNotBlockedSql(viewerId: string): Prisma.Sql {
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "user_blocks" ub
    WHERE (ub."blockerId" = ${viewerId} AND ub."blockedId" = l."ownerId")
       OR (ub."blockerId" = l."ownerId" AND ub."blockedId" = ${viewerId})
  )`
}
