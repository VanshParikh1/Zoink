import { Report, ReportReason, ReportStatus, ReportTargetType } from '@prisma/client'
import prisma from '../utils/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors'

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
  } else if (targetType === 'LISTING') {
    const listing = await db.listing.findUnique({ where: { id: targetId } })
    if (!listing) throw new NotFoundError('Reported listing not found')
    if (listing.ownerId === reporterId) throw new BadRequestError('You cannot report your own listing.')
  } else {
    const message = await db.message.findUnique({
      where: { id: targetId },
      select: { senderId: true, conversation: { select: { renterId: true, ownerId: true } } },
    })
    if (!message) throw new NotFoundError('Reported message not found')
    // Only someone in the conversation could have seen the message, so only
    // they can report it — message ids aren't a reporting surface for anyone else.
    const { renterId, ownerId } = message.conversation
    if (reporterId !== renterId && reporterId !== ownerId) {
      throw new ForbiddenError('You can only report messages in your own conversations.')
    }
    if (message.senderId === reporterId) throw new BadRequestError('You cannot report your own message.')
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
  const messageIds = reports.filter((r) => r.targetType === 'MESSAGE').map((r) => r.targetId)

  const [users, listings, messages] = await Promise.all([
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
    listingIds.length
      ? db.listing.findMany({ where: { id: { in: listingIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    messageIds.length
      ? db.message.findMany({
        where: { id: { in: messageIds } },
        select: { id: true, body: true, sender: { select: { firstName: true, lastName: true } } },
      })
      : Promise.resolve([]),
  ])

  const userLabels = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]))
  const listingLabels = new Map(listings.map((l) => [l.id, l.title]))
  // Admins need the message text itself to judge the report, so the label
  // carries the (truncated) body along with who sent it.
  const messageLabels = new Map(
    messages.map((m) => {
      const body = m.body.length > 140 ? `${m.body.slice(0, 137)}...` : m.body
      return [m.id, `${m.sender.firstName} ${m.sender.lastName}: "${body}"`]
    })
  )

  return reports.map((report) => ({
    ...report,
    targetLabel:
      report.targetType === 'USER'
        ? userLabels.get(report.targetId) ?? '[deleted user]'
        : report.targetType === 'LISTING'
          ? listingLabels.get(report.targetId) ?? '[deleted listing]'
          : messageLabels.get(report.targetId) ?? '[deleted message]',
  }))
}
