import { DEMO_USER } from '../config/demoMode'
import { Booking, BookingStatus, Conversation, ListingPreview, Message, User } from '../types'
import { CreateBookingPayload } from './bookingsApi'
import { mockGetListing } from './mockListings'

const demoUser: User = {
  id: DEMO_USER.id,
  email: DEMO_USER.email,
  firstName: DEMO_USER.firstName,
  lastName: 'Demo',
  verificationStatus: 'VERIFIED',
  createdAt: new Date().toISOString(),
}

const otherUser: User = {
  id: 'demo-user-2',
  email: 'avery@zoink.app',
  firstName: 'Avery',
  lastName: 'Chen',
  verificationStatus: 'VERIFIED',
  createdAt: new Date().toISOString(),
}

function toListingPreview(listing: Awaited<ReturnType<typeof mockGetListing>>): ListingPreview {
  return {
    id: listing.id,
    title: listing.title,
    category: listing.category,
    dailyPrice: listing.dailyPrice,
    city: listing.city,
    address: listing.address,
    isAvailable: listing.isAvailable,
    images: listing.images,
  }
}

let bookings: Booking[] = []

let conversations: Conversation[] = [
  {
    id: 'demo-conversation-1',
    listingId: 'demo-listing-1',
    listing: {
      id: 'demo-listing-1',
      title: 'Sony Bluetooth Speaker',
      category: 'Audio/Video',
      dailyPrice: 12,
      city: 'Toronto',
      address: 'Downtown campus',
      isAvailable: true,
      images: [],
    },
    renterId: demoUser.id,
    renter: demoUser,
    ownerId: otherUser.id,
    owner: otherUser,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    lastMessage: {
      id: 'demo-message-2',
      body: 'Yep, pickup after 6pm works.',
      senderId: otherUser.id,
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    },
    unread: true,
  },
]

let messagesByConversation: Record<string, Message[]> = {
  'demo-conversation-1': [
    {
      id: 'demo-message-1',
      conversationId: 'demo-conversation-1',
      senderId: demoUser.id,
      sender: demoUser,
      body: 'Hey, is this speaker still available for Friday?',
      createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    },
    {
      id: 'demo-message-2',
      conversationId: 'demo-conversation-1',
      senderId: otherUser.id,
      sender: otherUser,
      body: 'Yep, pickup after 6pm works.',
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    },
  ],
}

function sortBookings(items: Booking[]) {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

function updateBookingStatus(id: string, status: BookingStatus) {
  const booking = bookings.find((item) => item.id === id)
  if (!booking) {
    throw new Error('Booking not found.')
  }

  booking.status = status
  return booking
}

export async function mockCreateBooking(data: CreateBookingPayload) {
  const listing = await mockGetListing(data.listingId)
  const startDate = new Date(data.startDate)
  const endDate = new Date(data.endDate)
  const msPerDay = 1000 * 60 * 60 * 24
  const rentalDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1
  const totalPrice = Number((listing.dailyPrice * rentalDays).toFixed(2))
  const depositAmount = Number((totalPrice * 0.3).toFixed(2))

  const booking: Booking = {
    id: `demo-booking-${Date.now()}`,
    status: 'PENDING',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalPrice,
    depositAmount,
    message: data.message,
    renterId: demoUser.id,
    renter: demoUser,
    ownerId: listing.ownerId,
    owner: listing.owner,
    listingId: listing.id,
    listing: toListingPreview(listing),
    createdAt: new Date().toISOString(),
  }

  bookings = [booking, ...bookings]
  return booking
}

export async function mockGetMyBookings() {
  return sortBookings(bookings.filter((booking) => booking.renterId === demoUser.id))
}

export async function mockGetIncomingRequests() {
  return sortBookings(bookings.filter((booking) => booking.ownerId === demoUser.id))
}

export async function mockGetBooking(id: string) {
  const booking = bookings.find((item) => item.id === id)
  if (!booking) throw new Error('Booking not found.')
  return booking
}

export async function mockAcceptBooking(id: string) {
  return updateBookingStatus(id, 'ACCEPTED')
}

export async function mockDeclineBooking(id: string) {
  return updateBookingStatus(id, 'DECLINED')
}

export async function mockCancelBooking(id: string) {
  return updateBookingStatus(id, 'CANCELLED')
}

export async function mockActivateBooking(id: string) {
  return updateBookingStatus(id, 'ACTIVE')
}

export async function mockCompleteBooking(id: string) {
  return updateBookingStatus(id, 'COMPLETED')
}

export async function mockOpenConversation(listingId: string) {
  const existing = conversations.find((conversation) => conversation.listingId === listingId && conversation.renterId === demoUser.id)
  if (existing) return existing

  const listing = await mockGetListing(listingId)

  const conversation: Conversation = {
    id: `demo-conversation-${Date.now()}`,
    listingId,
    listing: toListingPreview(listing),
    renterId: demoUser.id,
    renter: demoUser,
    ownerId: listing.ownerId,
    owner: listing.owner,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessage: null,
    unread: false,
  }

  conversations = [conversation, ...conversations]
  messagesByConversation[conversation.id] = []
  return conversation
}

export async function mockGetMyConversations() {
  return [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function mockGetConversationMessages(conversationId: string, after?: string) {
  const messages = messagesByConversation[conversationId] ?? []
  if (!after) return messages

  const index = messages.findIndex((message) => message.id === after)
  return index >= 0 ? messages.slice(index + 1) : messages
}

export async function mockSendMessage(conversationId: string, body: string) {
  const trimmed = body.trim()
  if (!trimmed) throw new Error('Message body cannot be empty.')

  const message: Message = {
    id: `demo-message-${Date.now()}`,
    conversationId,
    senderId: demoUser.id,
    sender: demoUser,
    body: trimmed,
    createdAt: new Date().toISOString(),
  }

  const current = messagesByConversation[conversationId] ?? []
  messagesByConversation[conversationId] = [...current, message]
  conversations = conversations.map((conversation) =>
    conversation.id === conversationId
      ? {
          ...conversation,
          updatedAt: message.createdAt,
          lastMessage: {
            id: message.id,
            body: message.body,
            senderId: message.senderId,
            createdAt: message.createdAt,
          },
          unread: false,
        }
      : conversation
  )

  return message
}
