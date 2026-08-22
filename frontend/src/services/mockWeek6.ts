import { Booking, BookingStatus, Conversation, Dispute, ListingPreview, Message, PendingReview, SubmittedReviewResult, User } from '../types'
import { CreateBookingPayload } from './bookingsApi'
import { CreateDisputePayload } from './disputesApi'
import { demoProfile, publicProfiles, toDemoUser } from './mockProfiles'
import { SubmitReviewPayload } from './reviewsApi'
import { mockGetListing } from './mockListings'

const demoUser: User = toDemoUser(demoProfile)
const otherUser: User = toDemoUser(publicProfiles['demo-user-2'])

function toListingPreview(listing: Awaited<ReturnType<typeof mockGetListing>>): ListingPreview {
  return {
    id: listing.id,
    title: listing.title,
    category: listing.category,
    dailyPrice: listing.dailyPrice,
    itemValue: listing.itemValue,
    city: listing.city,
    address: listing.address,
    isAvailable: listing.isAvailable,
    images: listing.images,
  }
}

let bookings: Booking[] = []
let pendingReviews: PendingReview[] = []
let disputes: Dispute[] = []

let conversations: Conversation[] = [
  {
    id: 'demo-conversation-1',
    listingId: 'demo-listing-1',
    listing: {
      id: 'demo-listing-1',
      title: 'Sony Bluetooth Speaker',
      category: 'Audio/Video',
      dailyPrice: '12',
      city: 'Toronto',
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
  booking.version += 1
  if (status === 'ACTIVE') {
    booking.paymentStatus = 'CAPTURE_PENDING'
  }
  if (status === 'COMPLETED') {
    booking.paymentStatus = 'PAYOUT_PENDING'
  }
  return booking
}

export async function mockCreateBooking(data: CreateBookingPayload) {
  const listing = await mockGetListing(data.listingId)
  const startDate = new Date(data.startDate)
  const endDate = new Date(data.endDate)
  const msPerDay = 1000 * 60 * 60 * 24
  const rentalDays = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1
  const totalPrice = Number((Number(listing.dailyPrice) * rentalDays).toFixed(2))
  const depositAmount = Number(listing.depositAmount ?? 0)
  const insuranceFee = data.insuranceOptIn && listing.itemValue
    ? Number(Math.min(50, Math.max(1, Number(listing.itemValue) * 0.03)).toFixed(2))
    : 0
  const commissionAmount = Number((totalPrice * 0.15).toFixed(2))

  const booking: Booking = {
    id: `demo-booking-${Date.now()}`,
    status: 'PENDING',
    version: 1,
    paymentStatus: 'AUTHORIZED',
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalPrice,
    depositAmount,
    commissionAmount,
    ownerPayout: Number((totalPrice - commissionAmount).toFixed(2)),
    insuranceOptIn: Boolean(data.insuranceOptIn),
    insuranceFee,
    stripePaymentIntentId: `pi_demo_${Date.now()}`,
    stripeChargeId: null,
    stripeTransferId: null,
    paidAt: null,
    refundedAt: null,
    payoutSentAt: null,
    pickupPhotos: [],
    returnPhotos: [],
    handoffInitiatedAt: null,
    returnInitiatedAt: null,
    ownerPickupTappedAt: null,
    renterPickupTappedAt: null,
    ownerReturnTappedAt: null,
    renterReturnTappedAt: null,
    disputeStatus: 'NONE',
    disputedAt: null,
    disputeReason: null,
    renterId: demoUser.id,
    renter: demoUser,
    ownerId: listing.ownerId,
    owner: listing.owner,
    listingId: listing.id,
    conversationId: null,
    listing: toListingPreview(listing),
    reviewObligations: [],
    pendingReview: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
  const booking = updateBookingStatus(id, 'COMPLETED')
  booking.completedAt = new Date().toISOString()

  pendingReviews = [
    {
      id: `demo-review-${booking.id}`,
      bookingId: booking.id,
      reviewerRole: 'LENDER',
      status: 'PENDING',
      scoreLabels: {
        scoreAKey: 'reliability',
        scoreBKey: 'care',
        scoreCKey: 'communication',
      },
      createdAt: new Date().toISOString(),
      reviewee: booking.renter,
      booking: {
        id: booking.id,
        startDate: booking.startDate,
        endDate: booking.endDate,
        completedAt: booking.completedAt,
        listing: {
          id: booking.listing.id,
          title: booking.listing.title,
          category: booking.listing.category,
          images: booking.listing.images,
        },
      },
    },
    ...pendingReviews.filter((item) => item.bookingId !== booking.id),
  ]

  booking.pendingReview = pendingReviews[0]
  return booking
}

export async function mockGetPendingReviews() {
  return pendingReviews
}

export async function mockSubmitReview(data: SubmitReviewPayload): Promise<SubmittedReviewResult> {
  const review = pendingReviews.find((item) => item.id === data.obligationId)
  if (!review) {
    throw new Error('Review prompt not found.')
  }

  pendingReviews = pendingReviews.filter((item) => item.id !== data.obligationId)

  const booking = bookings.find((item) => item.id === review.bookingId)
  if (booking?.pendingReview?.id === data.obligationId) {
    booking.pendingReview = null
  }

  return {
    review: {
      id: `demo-submitted-review-${Date.now()}`,
      bookingId: review.bookingId,
      reviewerId: demoUser.id,
      revieweeId: review.reviewee.id,
      reviewerRole: review.reviewerRole,
      scoreA: data.scoreA,
      scoreB: data.scoreB,
      scoreC: data.scoreC,
      itemRating: data.itemRating ?? null,
      itemNotes: data.itemNotes ?? null,
      personNotes: data.personNotes ?? null,
      createdAt: new Date().toISOString(),
    },
    pendingRemaining: pendingReviews.length,
    reviewee: review.reviewee,
    booking: {
      id: review.booking.id,
      listing: {
        id: review.booking.listing.id,
        title: review.booking.listing.title,
      },
    },
  }
}

const UNRESOLVED_DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW']

export async function mockCreateDispute(data: CreateDisputePayload): Promise<Dispute> {
  const booking = bookings.find((item) => item.id === data.bookingId)
  if (!booking) throw new Error('Booking not found.')

  if (booking.renterId !== demoUser.id && booking.ownerId !== demoUser.id) {
    throw new Error('Only the renter or owner can open a dispute for this booking.')
  }

  const existing = disputes.find(
    (item) => item.bookingId === data.bookingId && UNRESOLVED_DISPUTE_STATUSES.includes(item.status)
  )
  if (existing) {
    throw new Error('An open dispute already exists for this booking.')
  }

  const now = new Date().toISOString()
  const dispute: Dispute = {
    id: `demo-dispute-${Date.now()}`,
    bookingId: data.bookingId,
    raisedByUserId: demoUser.id,
    reason: data.reason,
    description: data.description,
    status: 'OPEN',
    resolutionNotes: null,
    refundAmountCents: null,
    resolvedByAdminId: null,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  }

  disputes = [dispute, ...disputes]
  booking.disputeStatus = 'OPEN'
  booking.disputeReason = data.reason
  booking.disputedAt = now

  return dispute
}

export async function mockGetMyDisputes(): Promise<Dispute[]> {
  return disputes
    .filter((item) => item.raisedByUserId === demoUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function mockGetDispute(id: string): Promise<Dispute> {
  const dispute = disputes.find((item) => item.id === id)
  if (!dispute) throw new Error('Dispute not found.')
  return dispute
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

export async function mockMarkConversationRead(conversationId: string) {
  conversations = conversations.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, unread: false } : conversation
  )
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
