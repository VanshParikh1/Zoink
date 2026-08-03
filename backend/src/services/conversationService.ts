import { Prisma } from '@prisma/client'
import type { ConversationResponse, MessageResponse } from '@zoink/shared'
import prisma from '../utils/prisma'
import { sendDirectPush } from './notificationService'
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors'

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
  renterLastReadAt: true,
  ownerLastReadAt: true,
} satisfies Prisma.ConversationSelect

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
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ renterId: currentUserId }, { ownerId: currentUserId }],
    },
    select: conversationSelect as any,
    orderBy: { createdAt: 'desc' },
  })

  return conversations.map((conversation: any) => toConversationSummary(conversation, currentUserId))
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

  const recipientId = conversation.renterId === currentUserId ? conversation.ownerId : conversation.renterId
  void sendDirectPush(
    recipientId,
    'New message on Zoink',
    trimmedBody.length > 120 ? `${trimmedBody.slice(0, 117)}...` : trimmedBody,
    { conversationId: conversation.id, listingId: conversation.listingId }
  )

  return toMessage(message)
}
