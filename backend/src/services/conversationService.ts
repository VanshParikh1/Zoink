import { Prisma, BookingStatus } from '@prisma/client'
import type { ConversationDetailResponse, ConversationListPage, ConversationResponse, MessageResponse, VerificationStatus } from '@zoink/shared'
import { z } from 'zod'
import prisma from '../utils/prisma'
import { notifyUser } from './notificationService'
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors'
import { assertNotBlocked, getBlockedUserIds } from './blockService'
import { decodeCursor, LEGACY_LIST_CAP, pageSize, splitPage, type PageParams } from '../utils/pagination'

const conversationSelect = {
  id: true,
  listingId: true,
  renterId: true,
  ownerId: true,
  createdAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      category: true,
      city: true,
      dailyPrice: true,
      images: {
        select: { id: true, url: true, order: true },
        orderBy: { order: 'asc' as const },
      },
    },
  },
  renter: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
  owner: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
  messages: {
    select: {
      id: true,
      body: true,
      senderId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
  bookings: {
    where: { status: 'ACCEPTED' as const },
    select: { id: true },
    take: 1,
  },
  renterLastReadAt: true,
  ownerLastReadAt: true,
} satisfies Prisma.ConversationSelect

// The inbox list loads the last message and accepted-unpaid booking separately
// (see withLastMessageAndAcceptedBooking): for more than one parent row,
// Prisma runs a nested `take: 1` as `WHERE "conversationId" IN (...)` with no
// LIMIT, reading every message of every conversation to keep one each.
const { messages: _messages, bookings: _bookings, ...conversationBaseSelect } = conversationSelect
// The inbox renders only the listing thumbnail (images[0]); the thread screen
// re-fetches GET /conversations/:id, which keeps every image.
const conversationListSelect = {
  ...conversationBaseSelect,
  listing: {
    select: {
      ...conversationBaseSelect.listing.select,
      images: { ...conversationBaseSelect.listing.select.images, take: 1 },
    },
  },
}

type LastMessageRow = { id: string; body: string; senderId: string; createdAt: Date; conversationId: string }

async function withLastMessageAndAcceptedBooking<T extends { id: string }>(conversations: T[]) {
  if (conversations.length === 0) return []
  const ids = conversations.map((conversation) => conversation.id)

  const [lastMessages, acceptedBookings] = await Promise.all([
    // One row per conversation, served by messages(conversationId, createdAt).
    prisma.$queryRaw<LastMessageRow[]>`
      SELECT DISTINCT ON ("conversationId") "id", "body", "senderId", "createdAt", "conversationId"
      FROM "messages"
      WHERE "conversationId" IN (${Prisma.join(ids)})
      ORDER BY "conversationId", "createdAt" DESC, "id" DESC
    `,
    // Same ordering the nested `bookings: { take: 1 }` select used (id ASC).
    prisma.booking.findMany({
      where: { conversationId: { in: ids }, status: 'ACCEPTED' },
      select: { id: true, conversationId: true },
      orderBy: { id: 'asc' },
    }),
  ])

  const lastMessageByConversation = new Map(
    lastMessages.map(({ conversationId, ...message }) => [conversationId, message])
  )
  const acceptedBookingByConversation = new Map<string, { id: string }>()
  for (const booking of acceptedBookings) {
    if (booking.conversationId && !acceptedBookingByConversation.has(booking.conversationId)) {
      acceptedBookingByConversation.set(booking.conversationId, { id: booking.id })
    }
  }

  return conversations.map((conversation) => {
    const lastMessage = lastMessageByConversation.get(conversation.id)
    const acceptedBooking = acceptedBookingByConversation.get(conversation.id)
    return {
      ...conversation,
      messages: lastMessage ? [lastMessage] : [],
      bookings: acceptedBooking ? [acceptedBooking] : [],
    }
  })
}

const messageInclude = {
  sender: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      verificationStatus: true,
    },
  },
} satisfies Prisma.MessageInclude

function toConversationSummary(conversation: any, currentUserId: string): ConversationResponse {
  const lastMessage = conversation.messages[0] ?? null
  const lastReadAt = conversation.renterId === currentUserId
    ? conversation.renterLastReadAt
    : conversation.ownerLastReadAt

  const unread = Boolean(
    lastMessage &&
    lastMessage.senderId !== currentUserId &&
    (!lastReadAt || new Date(lastMessage.createdAt) > new Date(lastReadAt))
  )

  return {
    id: conversation.id,
    listingId: conversation.listingId,
    listing: conversation.listing,
    renterId: conversation.renterId,
    renter: conversation.renter,
    ownerId: conversation.ownerId,
    owner: conversation.owner,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt ?? conversation.createdAt,
    lastMessage,
    unread,
    acceptedUnpaidBookingId: conversation.bookings?.[0]?.id ?? null,
  }
}

function toMessage(message: any): MessageResponse {
  return {
    ...message,
  }
}

async function getConversationForParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  })

  if (!conversation) {
    throw new NotFoundError('Conversation not found.')
  }

  if (conversation.renterId !== userId && conversation.ownerId !== userId) {
    throw new ForbiddenError('You do not have access to this conversation.')
  }

  return conversation
}

export async function openConversation(currentUserId: string, listingId: string): Promise<ConversationResponse> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
    },
  })

  if (!listing) {
    throw new NotFoundError('Listing not found.')
  }

  if (listing.ownerId === currentUserId) {
    throw new BadRequestError('You cannot open a conversation with your own listing.')
  }

  await assertNotBlocked(currentUserId, listing.ownerId)

  const conversation = await prisma.conversation.upsert({
    where: {
      listingId_renterId: {
        listingId,
        renterId: currentUserId,
      },
    },
    update: {},
    create: {
      listingId,
      renterId: currentUserId,
      ownerId: listing.ownerId,
    },
    select: conversationSelect as any,
  })

  return toConversationSummary(conversation, currentUserId)
}

// Unpaginated, for app builds from before pagination (no `limit`), capped.
export async function getMyConversations(currentUserId: string): Promise<ConversationResponse[]> {
  // Threads with anyone on the other side of a block (either direction) drop
  // out of the inbox. The rows are kept so an unblock brings them back.
  const blockedIds = await getBlockedUserIds(currentUserId)

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ renterId: currentUserId }, { ownerId: currentUserId }],
      ...(blockedIds.length
        ? { NOT: [{ renterId: { in: blockedIds } }, { ownerId: { in: blockedIds } }] }
        : {}),
    },
    select: conversationListSelect,
    orderBy: { createdAt: 'desc' },
    take: LEGACY_LIST_CAP,
  })

  const withLatest = await withLastMessageAndAcceptedBooking(conversations)
  return withLatest.map((conversation) => toConversationSummary(conversation, currentUserId))
}

const inboxCursor = z.tuple([z.number().int(), z.string().max(64)])

type InboxRow = {
  id: string
  createdMs: bigint
  listingId: string
  renterId: string
  ownerId: string
  createdAt: Date
  renterLastReadAt: Date | null
  ownerLastReadAt: Date | null
  title: string
  category: string
  city: string
  dailyPrice: Prisma.Decimal
  imageId: string | null
  imageUrl: string | null
  imageOrder: number | null
  renterFirstName: string
  renterLastName: string
  renterAvatarUrl: string | null
  renterVerificationStatus: VerificationStatus
  ownerFirstName: string
  ownerLastName: string
  ownerAvatarUrl: string | null
  ownerVerificationStatus: VerificationStatus
  lastMessageId: string | null
  lastMessageBody: string | null
  lastMessageSenderId: string | null
  lastMessageCreatedAt: Date | null
  acceptedBookingId: string | null
}

// The caller's conversations, minus anyone on the other side of a block.
function myConversationsSql(userId: string) {
  return Prisma.sql`
    (c."renterId" = ${userId} OR c."ownerId" = ${userId})
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks ub
      WHERE (ub."blockerId" = ${userId} AND ub."blockedId" IN (c."renterId", c."ownerId"))
         OR (ub."blockedId" = ${userId} AND ub."blockerId" IN (c."renterId", c."ownerId"))
    )
  `
}

/** GET /conversations/me with `limit`: newest conversation first, as before,
 *  one page in one statement (listing, first photo, both people, the last
 *  message and an accepted-unpaid booking joined per row), and the number of
 *  unread conversations across all pages for the Inbox tab's badge. */
export async function listMyConversationsPage(currentUserId: string, params: PageParams): Promise<ConversationListPage> {
  const size = pageSize(params)
  const before = params.cursor ? decodeCursor(params.cursor, inboxCursor) : null
  const mine = myConversationsSql(currentUserId)
  const createdMs = Prisma.sql`FLOOR(EXTRACT(EPOCH FROM c."createdAt") * 1000)::bigint`

  const [rows, [unread]] = await Promise.all([
    prisma.$queryRaw<InboxRow[]>`
      SELECT p."createdMs", c.id, c."listingId", c."renterId", c."ownerId", c."createdAt",
             c."renterLastReadAt", c."ownerLastReadAt",
             l.title, l.category, l.city, l."dailyPrice",
             img.id AS "imageId", img.url AS "imageUrl", img."order" AS "imageOrder",
             r."firstName" AS "renterFirstName", r."lastName" AS "renterLastName",
             r."avatarUrl" AS "renterAvatarUrl", r."verificationStatus" AS "renterVerificationStatus",
             o."firstName" AS "ownerFirstName", o."lastName" AS "ownerLastName",
             o."avatarUrl" AS "ownerAvatarUrl", o."verificationStatus" AS "ownerVerificationStatus",
             last.id AS "lastMessageId", last.body AS "lastMessageBody",
             last."senderId" AS "lastMessageSenderId", last."createdAt" AS "lastMessageCreatedAt",
             accepted.id AS "acceptedBookingId"
      FROM (
        SELECT c.id, ${createdMs} AS "createdMs"
        FROM conversations c
        WHERE ${mine}
        ${before ? Prisma.sql`AND (${createdMs}, c.id) < (${before[0]}::bigint, ${before[1]}::text)` : Prisma.empty}
        ORDER BY "createdMs" DESC, c.id DESC
        LIMIT ${size + 1}
      ) p
      JOIN conversations c ON c.id = p.id
      JOIN listings l ON l.id = c."listingId"
      JOIN users r ON r.id = c."renterId"
      JOIN users o ON o.id = c."ownerId"
      LEFT JOIN LATERAL (
        SELECT i.id, i.url, i."order" FROM listing_images i
        WHERE i."listingId" = l.id ORDER BY i."order" LIMIT 1
      ) img ON true
      LEFT JOIN LATERAL (
        SELECT m.id, m.body, m."senderId", m."createdAt" FROM messages m
        WHERE m."conversationId" = c.id ORDER BY m."createdAt" DESC, m.id DESC LIMIT 1
      ) last ON true
      LEFT JOIN LATERAL (
        SELECT b.id FROM bookings b
        WHERE b."conversationId" = c.id AND b.status = 'ACCEPTED' ORDER BY b.id LIMIT 1
      ) accepted ON true
      ORDER BY p."createdMs" DESC, p.id DESC
    `,
    // Same rule as toConversationSummary's `unread`: the latest message is
    // from the other person and newer than the caller's last read.
    prisma.$queryRaw<{ unreadCount: number }[]>`
      SELECT count(*)::int AS "unreadCount"
      FROM conversations c
      CROSS JOIN LATERAL (
        SELECT m."senderId", m."createdAt" FROM messages m
        WHERE m."conversationId" = c.id ORDER BY m."createdAt" DESC, m.id DESC LIMIT 1
      ) last
      CROSS JOIN LATERAL (
        SELECT CASE WHEN c."renterId" = ${currentUserId} THEN c."renterLastReadAt" ELSE c."ownerLastReadAt" END AS "readAt"
      ) mine
      WHERE ${mine}
        AND last."senderId" <> ${currentUserId}
        AND (mine."readAt" IS NULL OR last."createdAt" > mine."readAt")
    `,
  ])

  const page = splitPage(rows, size, (row) => [Number(row.createdMs), row.id])
  return {
    items: page.items.map((row) =>
      toConversationSummary(
        {
          id: row.id,
          listingId: row.listingId,
          renterId: row.renterId,
          ownerId: row.ownerId,
          createdAt: row.createdAt,
          renterLastReadAt: row.renterLastReadAt,
          ownerLastReadAt: row.ownerLastReadAt,
          listing: {
            id: row.listingId,
            title: row.title,
            category: row.category,
            city: row.city,
            dailyPrice: row.dailyPrice.toString(),
            images: row.imageId ? [{ id: row.imageId, url: row.imageUrl, order: row.imageOrder }] : [],
          },
          renter: {
            id: row.renterId,
            firstName: row.renterFirstName,
            lastName: row.renterLastName,
            avatarUrl: row.renterAvatarUrl,
            verificationStatus: row.renterVerificationStatus,
          },
          owner: {
            id: row.ownerId,
            firstName: row.ownerFirstName,
            lastName: row.ownerLastName,
            avatarUrl: row.ownerAvatarUrl,
            verificationStatus: row.ownerVerificationStatus,
          },
          messages: row.lastMessageId
            ? [{ id: row.lastMessageId, body: row.lastMessageBody, senderId: row.lastMessageSenderId, createdAt: row.lastMessageCreatedAt }]
            : [],
          bookings: row.acceptedBookingId ? [{ id: row.acceptedBookingId }] : [],
        },
        currentUserId
      )
    ),
    nextCursor: page.nextCursor,
    unreadCount: unread?.unreadCount ?? 0,
  }
}

// "In flight" for the chat header: any booking that still needs either party
// to act on it. Deliberately broader than acceptedUnpaidBookingId's
// ACCEPTED-and-unpaid — a completed booking plus a fresh PENDING request on
// the same listing is a real case, and the header should reflect the PENDING
// one.
const IN_FLIGHT_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.ACCEPTED,
  BookingStatus.ACTIVE,
]

export async function getConversationById(currentUserId: string, conversationId: string): Promise<ConversationDetailResponse> {
  // One read serves both the participant check and the response — this is
  // polled every few seconds by an open chat.
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: conversationSelect,
  })

  if (!conversation) {
    throw new NotFoundError('Conversation not found.')
  }

  if (conversation.renterId !== currentUserId && conversation.ownerId !== currentUserId) {
    throw new ForbiddenError('You do not have access to this conversation.')
  }

  const inFlightBookings = await prisma.booking.findMany({
    where: {
      conversationId,
      status: { in: IN_FLIGHT_BOOKING_STATUSES },
    },
    select: { id: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  })

  return {
    ...toConversationSummary(conversation, currentUserId),
    bookings: inFlightBookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      updatedAt: booking.updatedAt.toISOString(),
    })),
  }
}

export async function getConversationMessages(currentUserId: string, conversationId: string, afterId?: string): Promise<MessageResponse[]> {
  await getConversationForParticipant(conversationId, currentUserId)

  // The cursor only counts if it belongs to this conversation.
  const afterMessage = afterId
    ? await prisma.message.findFirst({
        where: { id: afterId, conversationId },
        select: { createdAt: true },
      })
    : null

  if (afterMessage) {
    // Forward polling: the next (up to) 100 messages after the cursor.
    const newer = await prisma.message.findMany({
      where: { conversationId, createdAt: { gt: afterMessage.createdAt } },
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
    return newer.map((message) => toMessage(message))
  }

  // Opening a thread: the newest 100, returned oldest-first, so the client's
  // poll cursor (the last element) is the latest message rather than the 100th
  // oldest — which opened long threads on stale history.
  const latest = await prisma.message.findMany({
    where: { conversationId },
    include: messageInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return latest.reverse().map((message) => toMessage(message))
}

export async function markConversationRead(currentUserId: string, conversationId: string): Promise<void> {
  const conversation = await getConversationForParticipant(conversationId, currentUserId)
  const isRenter = conversation.renterId === currentUserId
  const lastReadAt = isRenter ? conversation.renterLastReadAt : conversation.ownerLastReadAt

  // An open chat calls this every few seconds. lastReadAt is only ever
  // compared against message timestamps (see toConversationSummary), so with
  // no message newer than it there is nothing to mark and the write is skipped.
  const unseen = await prisma.message.findFirst({
    where: { conversationId, ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}) },
    select: { id: true },
  })
  if (!unseen) return

  await prisma.conversation.update({
    where: { id: conversationId },
    data: isRenter ? { renterLastReadAt: new Date() } : { ownerLastReadAt: new Date() },
  })
}

export async function sendMessage(currentUserId: string, conversationId: string, body: string): Promise<MessageResponse> {
  const conversation = await getConversationForParticipant(conversationId, currentUserId)
  const trimmedBody = body.trim()

  if (!trimmedBody) {
    throw new BadRequestError('Message body cannot be empty.')
  }

  const recipientId = conversation.renterId === currentUserId ? conversation.ownerId : conversation.renterId
  await assertNotBlocked(currentUserId, recipientId)

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: conversation.id,
        senderId: currentUserId,
        body: trimmedBody,
      },
      include: messageInclude as any,
    })

    return created
  })

  // Push + DB row, in line with every other event type (was push-only before).
  void notifyUser({
    userId: recipientId,
    type: 'MESSAGE_RECEIVED',
    title: 'New message on Zoink',
    body: trimmedBody.length > 120 ? `${trimmedBody.slice(0, 117)}...` : trimmedBody,
    data: { conversationId: conversation.id, listingId: conversation.listingId },
  })

  return toMessage(message)
}
