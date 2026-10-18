import { Prisma, Role, VerificationStatus } from '@prisma/client'

// An account that never verified its university email. It was never active:
// requireVerified keeps everything but verification away from it, so there is
// nothing of it to keep. The activity checks guard rows created before that
// gate covered every route.
const NEVER_ACTIVE: Prisma.UserWhereInput = {
  verificationStatus: { not: VerificationStatus.VERIFIED },
  role: Role.USER,
  deletedAt: null,
  listings: { none: {} },
  bookingsAsOwner: { none: {} },
  bookingsAsRenter: { none: {} },
  ownerConversations: { none: {} },
  renterConversations: { none: {} },
  messages: { none: {} },
  reviewsGiven: { none: {} },
  reviewsReceived: { none: {} },
  raisedDisputes: { none: {} },
  resolvedDisputes: { none: {} },
  filedReports: { none: {} },
  reviewedReports: { none: {} },
}

/** Deletes the never-active, unverified accounts matching `where`, with their
 *  codes, blocks and notifications. Re-checks every condition in the delete
 *  itself, so an account verified a moment ago is left alone, and running it
 *  again deletes nothing more. Returns how many were deleted. */
export async function deleteUnverifiedAccounts(tx: Prisma.TransactionClient, where: Prisma.UserWhereInput): Promise<number> {
  const scope: Prisma.UserWhereInput = { AND: [where, NEVER_ACTIVE] }
  // The one relation that doesn't cascade.
  await tx.notification.deleteMany({ where: { user: scope } })
  const { count } = await tx.user.deleteMany({ where: scope })
  return count
}
