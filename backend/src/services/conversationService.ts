import { Prisma, BookingStatus } from '@prisma/client'
import type { ConversationDetailResponse, ConversationResponse, MessageResponse } from '@zoink/shared'
import prisma from '../utils/prisma'
import { notifyUser } from './notificationService'
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors'
import { assertNotBlocked, getBlockedUserIds } from './blockService'

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
const { messages: _messages, bookings: _bookings, ...conversationListSelect } = conversationSelect

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
    where: { id: listingId },
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
  })

  const withLatest = await withLastMessageAndAcceptedBooking(conversations)
  return withLatest.map((conversation) => toConversationSummary(conversation, currentUserId))
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

  const afterMessage = afterId
    ? await prisma.message.findUnique({
        where: { id: afterId },
        select: { createdAt: true },
      })
    : null

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(afterMessage ? { createdAt: { gt: afterMessage.createdAt } } : {}),
    },
    include: messageInclude as any,
    orderBy: { createdAt: 'asc' },
    take: 100,
  })

  return messages.map((message: any) => toMessage(message))
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
