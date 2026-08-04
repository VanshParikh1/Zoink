import { Report, ReportReason, ReportStatus, ReportTargetType } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, NotFoundError } from '../utils/errors'

export async function createReport(
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  description: string | undefined,
  db: typeof prisma = prisma
) {
  if (targetType === 'USER') {
    const user = await db.user.findUnique({ where: { id: targetId } })
    if (!user) throw new NotFoundError('Reported user not found')
    // Self-referential business rule, not an access-control failure — matches
    // bookingService's "You cannot book your own listing." and
    // conversationService's "You cannot open a conversation with your own
    // listing.", both BadRequestError rather than ForbiddenError.
    if (targetId === reporterId) throw new BadRequestError('You cannot report yourself.')
  } else {
    const listing = await db.listing.findUnique({ where: { id: targetId } })
    if (!listing) throw new NotFoundError('Reported listing not found')
    if (listing.ownerId === reporterId) throw new BadRequestError('You cannot report your own listing.')
  }

  return db.report.create({
    data: {
      reporterId,
      targetType,
      targetId,
      reason,
      description,
      status: 'OPEN',
    },
  })
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  status: ReportStatus,
  adminNotes: string | undefined,
  db: typeof prisma = prisma
) {
  const report = await db.report.findUnique({ where: { id: reportId } })
  if (!report) throw new NotFoundError('Report not found')

  if (report.status !== 'OPEN') {
    throw new BadRequestError('Report has already been reviewed.')
  }

  return db.report.update({
    where: { id: reportId },
    data: {
      status,
      adminNotes,
      reviewedByAdminId: adminId,
      reviewedAt: new Date(),
    },
  })
}

// Report.targetId is a polymorphic pointer (no FK), so admin views need a
// separate batched lookup to show a human-readable label instead of a raw
// id. Targets can be deleted after being reported (e.g. a scam listing
// taken down), so a missing target resolves to a placeholder rather than
// throwing.
export async function attachTargetLabels<T extends Pick<Report, 'targetType' | 'targetId'>>(
  reports: T[],
  db: typeof prisma = prisma
): Promise<(T & { targetLabel: string })[]> {
  const userIds = reports.filter((r) => r.targetType === 'USER').map((r) => r.targetId)
  const listingIds = reports.filter((r) => r.targetType === 'LISTING').map((r) => r.targetId)

  const [users, listings] = await Promise.all([
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
    listingIds.length
      ? db.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ])

  const userLabels = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))
  const listingLabels = new Map(listings.map((l) => [l.id, l.title]))

  return reports.map((report) => ({
    ...report,
    targetLabel:
      report.targetType === 'USER'
        ? userLabels.get(report.targetId) ?? '[deleted user]'
        : listingLabels.get(report.targetId) ?? '[deleted listing]',
  }))
}
