import { Booking, BookingStatus, Conversation, Dispute, ListingPreview, Message, PendingReview, SubmittedReviewResult, User } from '../types'
import { CreateBookingPayload } from './bookingsApi'
import { CreateDisputePayload } from './disputesApi'
import { demoProfile, publicProfiles, toDemoUser } from './mockProfiles'
import { SubmitReviewPayload } from './reviewsApi'
import { DEMO_LISTINGS, mockGetListing } from './mockListings'

const demoUser: User = toDemoUser(demoProfile)

function userOf(id: string): User {
  return toDemoUser(publicProfiles[id] ?? demoProfile)
}

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

function listingById(id: string) {
  const listing = DEMO_LISTINGS.find((item) => item.id === id)
  if (!listing) throw new Error(`Demo listing ${id} not found`)
  return listing
}

// ─────────────────────────────────────────────────────────────────────────────
// Stable clock so every screenshot run produces identical relative times.
// ─────────────────────────────────────────────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000
const T0 = new Date('2026-06-01T12:00:00.000Z').getTime()
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString()
const daysFromNow = (days: number) => at(days * DAY)
const hoursFromNow = (hours: number) => at(hours * 60 * 60 * 1000)

function rentalDays(startIso: string, endIso: string) {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY) + 1
}

// Handoff photo stand-ins (Unsplash, objects only). Reused across bookings.
const HANDOFF_PHOTOS = {
  pickupA: 'https://images.unsplash.com/photo-1519183071298-a2962feb14f4?auto=format&fit=crop&w=1200&q=80',
  pickupB: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?auto=format&fit=crop&w=1200&q=80',
  returnA: 'https://images.unsplash.com/photo-1483058712412-4245e9b90334?auto=format&fit=crop&w=1200&q=80',
  returnB: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Demo bookings — five BookingStatus values represented on BOTH sides of the
// logged-in demo user (demo-user-1): as renter (renting others' listings) and
// as owner (others renting demo-user-1's listings 3 / 12 / 15). Runtime mock
// mutators still work on top of this starting state.
// ─────────────────────────────────────────────────────────────────────────────

type BookingSeed = {
  id: string
  listingId: string
  renterId: string
  status: BookingStatus
  startDate: string
  endDate: string
  createdAt: string
  paymentStatus: Booking['paymentStatus']
  depositStatus?: Booking['depositStatus']
  paidAt?: string | null
  completedAt?: string | null
  pickupPhotos?: string[]
  returnPhotos?: string[]
  handoffInitiatedAt?: string | null
  returnInitiatedAt?: string | null
  ownerPickupTappedAt?: string | null
  renterPickupTappedAt?: string | null
  ownerReturnTappedAt?: string | null
  renterReturnTappedAt?: string | null
}

const BOOKING_SEEDS: BookingSeed[] = [
  // ── demo-user-1 as RENTER ──
  {
    id: 'demo-booking-r1',
    listingId: 'demo-listing-2', // Canon Rebel — demo-user-4
    renterId: 'demo-user-1',
    status: 'PENDING',
    startDate: daysFromNow(3),
    endDate: daysFromNow(5),
    createdAt: hoursFromNow(-20),
    paymentStatus: 'AUTHORIZED',
  },
  {
    id: 'demo-booking-r2',
    listingId: 'demo-listing-8', // JBL PartyBox — demo-user-5
    renterId: 'demo-user-1',
    status: 'ACCEPTED',
    startDate: daysFromNow(3),
    endDate: daysFromNow(4),
    createdAt: hoursFromNow(-30),
    paymentStatus: 'AUTHORIZED',
  },
  {
    id: 'demo-booking-r3',
    listingId: 'demo-listing-13', // Makita drill — demo-user-6
    renterId: 'demo-user-1',
    status: 'CONFIRMED',
    startDate: daysFromNow(5),
    endDate: daysFromNow(6),
    createdAt: daysFromNow(-2),
    paymentStatus: 'AUTHORIZED',
    depositStatus: 'AUTHORIZED',
    paidAt: daysFromNow(-2),
  },
  {
    id: 'demo-booking-r4',
    listingId: 'demo-listing-18', // Bike repair stand — demo-user-7
    renterId: 'demo-user-1',
    status: 'ACTIVE',
    startDate: daysFromNow(0),
    endDate: daysFromNow(1),
    createdAt: daysFromNow(-3),
    paymentStatus: 'CAPTURED',
    depositStatus: 'AUTHORIZED',
    paidAt: daysFromNow(-3),
    handoffInitiatedAt: hoursFromNow(-4),
    pickupPhotos: [HANDOFF_PHOTOS.pickupA, HANDOFF_PHOTOS.pickupB],
    ownerPickupTappedAt: hoursFromNow(-3),
    renterPickupTappedAt: hoursFromNow(-3),
  },
  {
    id: 'demo-booking-r5',
    listingId: 'demo-listing-5', // GoPro — demo-user-3
    renterId: 'demo-user-1',
    status: 'COMPLETED',
    startDate: daysFromNow(-6),
    endDate: daysFromNow(-4),
    createdAt: daysFromNow(-9),
    paymentStatus: 'PAYOUT_PENDING',
    depositStatus: 'RELEASED',
    paidAt: daysFromNow(-9),
    completedAt: daysFromNow(-4),
    handoffInitiatedAt: daysFromNow(-6),
    returnInitiatedAt: daysFromNow(-4),
    pickupPhotos: [HANDOFF_PHOTOS.pickupA, HANDOFF_PHOTOS.pickupB],
    returnPhotos: [HANDOFF_PHOTOS.returnA, HANDOFF_PHOTOS.returnB],
    ownerPickupTappedAt: daysFromNow(-6),
    renterPickupTappedAt: daysFromNow(-6),
    ownerReturnTappedAt: daysFromNow(-4),
    renterReturnTappedAt: daysFromNow(-4),
  },

  // ── demo-user-1 as OWNER (listings 3 / 12 / 15) ──
  {
    id: 'demo-booking-o1',
    listingId: 'demo-listing-3', // Sony a6400 — demo-user-1
    renterId: 'demo-user-2',
    status: 'PENDING',
    startDate: daysFromNow(2),
    endDate: daysFromNow(4),
    createdAt: hoursFromNow(-6),
    paymentStatus: 'AUTHORIZED',
  },
  {
    id: 'demo-booking-o2',
    listingId: 'demo-listing-12', // Shure mics — demo-user-1
    renterId: 'demo-user-8',
    status: 'ACCEPTED',
    startDate: daysFromNow(2),
    endDate: daysFromNow(3),
    createdAt: hoursFromNow(-28),
    paymentStatus: 'AUTHORIZED',
  },
  {
    id: 'demo-booking-o3',
    listingId: 'demo-listing-15', // Bosch sander — demo-user-1
    renterId: 'demo-user-9',
    status: 'CONFIRMED',
    startDate: daysFromNow(4),
    endDate: daysFromNow(6),
    createdAt: daysFromNow(-1),
    paymentStatus: 'AUTHORIZED',
    depositStatus: 'AUTHORIZED',
    paidAt: daysFromNow(-1),
  },
  {
    id: 'demo-booking-o4',
    listingId: 'demo-listing-3', // Sony a6400 — demo-user-1
    renterId: 'demo-user-10',
    status: 'ACTIVE',
    startDate: daysFromNow(-1),
    endDate: daysFromNow(3),
    createdAt: daysFromNow(-4),
    paymentStatus: 'CAPTURED',
    depositStatus: 'AUTHORIZED',
    paidAt: daysFromNow(-4),
    handoffInitiatedAt: daysFromNow(-1),
    pickupPhotos: [HANDOFF_PHOTOS.pickupA, HANDOFF_PHOTOS.pickupB],
    ownerPickupTappedAt: daysFromNow(-1),
    renterPickupTappedAt: daysFromNow(-1),
  },
  {
    id: 'demo-booking-o5',
    listingId: 'demo-listing-12', // Shure mics — demo-user-1
    renterId: 'demo-user-8',
    status: 'COMPLETED',
    startDate: daysFromNow(-5),
    endDate: daysFromNow(-3),
    createdAt: daysFromNow(-8),
    paymentStatus: 'PAYOUT_PENDING',
    depositStatus: 'RELEASED',
    paidAt: daysFromNow(-8),
    completedAt: daysFromNow(-3),
    handoffInitiatedAt: daysFromNow(-5),
    returnInitiatedAt: daysFromNow(-3),
    pickupPhotos: [HANDOFF_PHOTOS.pickupA, HANDOFF_PHOTOS.pickupB],
    returnPhotos: [HANDOFF_PHOTOS.returnA, HANDOFF_PHOTOS.returnB],
    ownerPickupTappedAt: daysFromNow(-5),
    renterPickupTappedAt: daysFromNow(-5),
    ownerReturnTappedAt: daysFromNow(-3),
    renterReturnTappedAt: daysFromNow(-3),
  },
]

function toBooking(seed: BookingSeed): Booking {
  const listing = listingById(seed.listingId)
  const days = rentalDays(seed.startDate, seed.endDate)
  const totalPrice = Number((Number(listing.dailyPrice) * days).toFixed(2))
  const commissionAmount = Number((totalPrice * 0.15).toFixed(2))
  const hstAmount = Number((totalPrice * 0.13).toFixed(2))
  const depositAmount = Number(listing.depositAmount ?? 0)
  const renter = userOf(seed.renterId)
  const owner = userOf(listing.ownerId)

  return {
    id: seed.id,
    status: seed.status,
    version: 1,
    paymentStatus: seed.paymentStatus,
    startDate: seed.startDate,
    endDate: seed.endDate,
    totalPrice,
    depositAmount,
    commissionAmount,
    ownerPayout: Number((totalPrice - commissionAmount).toFixed(2)),
    insuranceOptIn: false,
    insuranceFee: 0,
    hstAmount,
    stripePaymentIntentId: `pi_demo_${seed.id}`,
    stripeDepositPaymentIntentId: seed.depositStatus ? `pi_demo_dep_${seed.id}` : null,
    depositStatus: seed.depositStatus ?? null,
    stripeChargeId: seed.paidAt ? `ch_demo_${seed.id}` : null,
    stripeTransferId: null,
    paidAt: seed.paidAt ?? null,
    refundedAt: null,
    payoutSentAt: null,
    pickupPhotos: seed.pickupPhotos ?? [],
    returnPhotos: seed.returnPhotos ?? [],
    handoffInitiatedAt: seed.handoffInitiatedAt ?? null,
    returnInitiatedAt: seed.returnInitiatedAt ?? null,
    ownerPickupTappedAt: seed.ownerPickupTappedAt ?? null,
    renterPickupTappedAt: seed.renterPickupTappedAt ?? null,
    ownerReturnTappedAt: seed.ownerReturnTappedAt ?? null,
    renterReturnTappedAt: seed.renterReturnTappedAt ?? null,
    disputeStatus: 'NONE',
    disputedAt: null,
    disputeReason: null,
    renterId: seed.renterId,
    renter,
    ownerId: listing.ownerId,
    owner,
    listingId: listing.id,
    conversationId: null,
    listing: toListingPreview(listing),
    reviewObligations: [],
    pendingReview: null,
    completedAt: seed.completedAt ?? null,
    createdAt: seed.createdAt,
    updatedAt: seed.completedAt ?? seed.createdAt,
  }
}

export const DEMO_BOOKINGS: Booking[] = BOOKING_SEEDS.map(toBooking)

// ─────────────────────────────────────────────────────────────────────────────
// Demo pending-review obligations — one per COMPLETED booking, one in each
// reviewer role, so ReviewPromptScreen has content and both role variants
// (item rating vs. person notes) are visible.
// ─────────────────────────────────────────────────────────────────────────────

function pendingReviewFor(
  bookingId: string,
  reviewerRole: PendingReview['reviewerRole'],
  revieweeId: string,
): PendingReview {
  const booking = DEMO_BOOKINGS.find((item) => item.id === bookingId)
  if (!booking) throw new Error(`Demo booking ${bookingId} not found`)
  const scoreLabels =
    reviewerRole === 'RENTER'
      ? { scoreAKey: 'accuracy', scoreBKey: 'condition', scoreCKey: 'pickupExperience' }
      : { scoreAKey: 'reliability', scoreBKey: 'care', scoreCKey: 'communication' }

  return {
    id: `demo-review-${bookingId}`,
    bookingId,
    reviewerRole,
    status: 'PENDING',
    scoreLabels,
    createdAt: booking.completedAt ?? booking.updatedAt,
    reviewee: userOf(revieweeId),
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
  }
}

export const DEMO_PENDING_REVIEWS: PendingReview[] = [
  // demo-user-1 rented the GoPro from demo-user-3 → reviews the item / lender.
  pendingReviewFor('demo-booking-r5', 'RENTER', 'demo-user-3'),
  // demo-user-8 rented demo-user-1's mics → demo-user-1 reviews the renter.
  pendingReviewFor('demo-booking-o5', 'LENDER', 'demo-user-8'),
]

// ─────────────────────────────────────────────────────────────────────────────
// Demo conversations + messages.
// ─────────────────────────────────────────────────────────────────────────────

function convListingSnapshot(listingId: string) {
  const listing = listingById(listingId)
  return {
    id: listing.id,
    title: listing.title,
    category: listing.category,
    city: listing.city,
    dailyPrice: listing.dailyPrice,
    images: listing.images,
  }
}

type MessageSeed = { senderId: string; body: string; minutesAgo: number }

function buildConversation(args: {
  id: string
  listingId: string
  renterId: string
  ownerId: string
  messages: MessageSeed[]
  acceptedUnpaidBookingId?: string | null
}): { conversation: Conversation; messages: Message[] } {
  const sorted = [...args.messages].sort((a, b) => b.minutesAgo - a.minutesAgo)
  const messages: Message[] = sorted.map((seed, index) => ({
    id: `${args.id}-msg-${index + 1}`,
    conversationId: args.id,
    senderId: seed.senderId,
    sender: userOf(seed.senderId),
    body: seed.body,
    createdAt: at(-seed.minutesAgo * 60 * 1000),
  }))
  const last = messages[messages.length - 1]

  const conversation: Conversation = {
    id: args.id,
    listingId: args.listingId,
    listing: convListingSnapshot(args.listingId),
    renterId: args.renterId,
    renter: userOf(args.renterId),
    ownerId: args.ownerId,
    owner: userOf(args.ownerId),
    createdAt: messages[0]?.createdAt ?? at(-DAY),
    updatedAt: last?.createdAt ?? at(-DAY),
    lastMessage: last
      ? { id: last.id, body: last.body, senderId: last.senderId, createdAt: last.createdAt }
      : null,
    unread: last ? last.senderId !== demoUser.id : false,
    acceptedUnpaidBookingId: args.acceptedUnpaidBookingId ?? null,
  }

  return { conversation, messages }
}

const CONVERSATION_BUILDS = [
  buildConversation({
    id: 'demo-conversation-1',
    listingId: 'demo-listing-1', // Sony speaker — demo-user-2
    renterId: 'demo-user-1',
    ownerId: 'demo-user-2',
    messages: [
      { senderId: 'demo-user-1', body: 'Hey! Is the speaker free this Friday night?', minutesAgo: 190 },
      { senderId: 'demo-user-2', body: 'It is — booked out Saturday but Friday is open.', minutesAgo: 175 },
      { senderId: 'demo-user-1', body: 'Perfect. Could I grab it around 6 and return Sunday morning?', minutesAgo: 120 },
      { senderId: 'demo-user-2', body: 'Yep, pickup after 6pm works. I am near the Kensington entrance.', minutesAgo: 95 },
      { senderId: 'demo-user-1', body: 'Great, sending the request now.', minutesAgo: 40 },
    ],
  }),
  buildConversation({
    id: 'demo-conversation-2',
    listingId: 'demo-listing-8', // JBL PartyBox — demo-user-5
    renterId: 'demo-user-1',
    ownerId: 'demo-user-5',
    acceptedUnpaidBookingId: 'demo-booking-r2',
    messages: [
      { senderId: 'demo-user-1', body: 'Looking to rent the PartyBox for a floor social on the 4th.', minutesAgo: 1700 },
      { senderId: 'demo-user-5', body: 'Nice, that date is open. It gets loud — you have somewhere to plug in?', minutesAgo: 1650 },
      { senderId: 'demo-user-1', body: 'Yeah, common room has outlets. Two spare cables would be great if you have them.', minutesAgo: 1600 },
      { senderId: 'demo-user-5', body: 'I will throw in an aux and a long extension cord. Accepting your request now.', minutesAgo: 1500 },
      { senderId: 'demo-user-5', body: 'Accepted — go ahead and pay when you get a sec so I can lock the date.', minutesAgo: 1490 },
    ],
  }),
  buildConversation({
    id: 'demo-conversation-3',
    listingId: 'demo-listing-3', // Sony a6400 — demo-user-1 (demo user is the OWNER here)
    renterId: 'demo-user-2',
    ownerId: 'demo-user-1',
    messages: [
      { senderId: 'demo-user-2', body: 'Hi! Is the a6400 good for a short film shoot next week?', minutesAgo: 500 },
      { senderId: 'demo-user-1', body: 'Definitely. Shoots clean 4K30 and the kit lens is fine for interiors.', minutesAgo: 470 },
      { senderId: 'demo-user-2', body: 'Amazing. Does it come with more than one battery?', minutesAgo: 300 },
      { senderId: 'demo-user-1', body: 'Two batteries, dual charger, and a 128GB card. Enough for a full day.', minutesAgo: 260 },
      { senderId: 'demo-user-2', body: 'Sending a request for Tue-Thu. Can pick up on campus?', minutesAgo: 90 },
      { senderId: 'demo-user-2', body: 'Just submitted it — let me know if the times work.', minutesAgo: 75 },
    ],
  }),
]

// ─────────────────────────────────────────────────────────────────────────────
// Mutable in-memory state — initialised from the demo datasets at module load
// so screenshots open already populated. Runtime mock mutators operate on these.
// ─────────────────────────────────────────────────────────────────────────────

let bookings: Booking[] = [...DEMO_BOOKINGS]
let pendingReviews: PendingReview[] = [...DEMO_PENDING_REVIEWS]
let disputes: Dispute[] = []

let conversations: Conversation[] = CONVERSATION_BUILDS.map((build) => build.conversation)

let messagesByConversation: Record<string, Message[]> = CONVERSATION_BUILDS.reduce<Record<string, Message[]>>(
  (acc, build) => {
    acc[build.conversation.id] = build.messages
    return acc
  },
  {},
)

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
  const days = Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1
  const totalPrice = Number((Number(listing.dailyPrice) * days).toFixed(2))
  const depositAmount = Number(listing.depositAmount ?? 0)
  // Zoink offers no insurance product at launch (terms.md §12) — the API no
  // longer accepts insuranceOptIn, so demo mode mirrors the backend and always
  // books with no insurance.
  const insuranceFee = 0
  const commissionAmount = Number((totalPrice * 0.15).toFixed(2))
  const hstAmount = Number((totalPrice * 0.13).toFixed(2))

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
    insuranceOptIn: false,
    insuranceFee,
    hstAmount,
    stripePaymentIntentId: `pi_demo_${Date.now()}`,
    stripeDepositPaymentIntentId: null,
    depositStatus: null,
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

export async function mockCreateBookingPaymentIntent(id: string) {
  const booking = bookings.find((item) => item.id === id)
  if (!booking) throw new Error('Booking not found.')
  booking.stripePaymentIntentId = `pi_demo_${Date.now()}`
  booking.paymentStatus = 'AUTHORIZED'
  return { ...booking, paymentClientSecret: `pi_demo_secret_${Date.now()}` }
}

export async function mockConfirmBookingPayment(id: string) {
  return updateBookingStatus(id, 'CONFIRMED')
}

export async function mockDeclineBooking(id: string) {
  return updateBookingStatus(id, 'DECLINED')
}

export async function mockCancelBooking(id: string) {
  return updateBookingStatus(id, 'CANCELLED')
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
    acceptedUnpaidBookingId: null,
  }

  conversations = [conversation, ...conversations]
  messagesByConversation[conversation.id] = []
  return conversation
}

export async function mockGetMyConversations() {
  return [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function mockGetConversation(conversationId: string) {
  const conversation = conversations.find((item) => item.id === conversationId)
  if (!conversation) throw new Error('Conversation not found.')
  // Demo mode doesn't model in-flight bookings against a conversation.
  return { ...conversation, bookings: [] }
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
