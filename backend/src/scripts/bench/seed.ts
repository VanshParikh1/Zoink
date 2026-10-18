// Seeds zoink_bench with a realistic, deterministic data set for run.ts:
// ~200 users, 450 listings (3 photos each), ~1,500 bookings across every
// status, 90 conversations (one with 500 messages), disputes, reports and
// review obligations, plus one fresh fixture per measured write request so
// every write in the run succeeds against its own row.
import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import {
  BookingStatus,
  DepositStatus,
  PaymentStatus,
  Prisma,
  ReviewRole,
  Role,
  University,
  VerificationStatus,
} from '@prisma/client'
import { TERMS_VERSION, PRIVACY_VERSION } from '@zoink/shared'
import prisma from '../../utils/prisma'

export const BENCH_PASSWORD = 'BenchPass123!'
export const N = 50

const TABLES = [
  'processed_stripe_events',
  'booking_events',
  'review_obligations',
  'reviews',
  'notifications',
  'disputes',
  'reports',
  'user_blocks',
  'bookings',
  'listing_images',
  'messages',
  'conversations',
  'listings',
  'user_reputations',
  'verification_tokens',
  'users',
]

const DEMO_PHOTOS = ['sample', 'cld-sample', 'cld-sample-2', 'cld-sample-3', 'cld-sample-4', 'cld-sample-5', 'samples/landscapes/nature-mountains', 'samples/food/dessert']

const CATEGORIES = ['Electronics', 'Tools', 'Sports', 'Outdoors', 'Kitchen', 'Books', 'Music', 'Gaming']

export type BenchFixtures = {
  renter: string
  owner: string
  admin: string
  otherUser: string
  renters: string[]
  ownerListings: string[]
  browseListing: string
  bigConversation: string
  renterBooking: string
  completedBooking: string
  dispute: string
  accept: string[]
  decline: string[]
  cancel: string[]
  paymentIntent: string[]
  confirm: string[]
  pickupInitiate: string[]
  pickupTap: string[]
  returnInitiate: string[]
  disputeCreate: string[]
  disputeResolve: string[]
  reportResolve: string[]
  reviewObligations: string[]
  messageConversations: string[]
  openConversationListings: string[]
  bookingCreateListings: string[]
  deletableListings: string[]
  deletableUsers: string[]
  verifyUsers: string[]
  resendUsers: string[]
  webhookBookings: string[]
}

let seq = 0
function uid() {
  return randomUUID()
}

function dayUtc(offsetDays: number) {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d
}

export async function truncate() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
}

export async function seed(): Promise<BenchFixtures> {
  await truncate()
  const passwordHash = await bcrypt.hash(BENCH_PASSWORD, 10)
  const users: Prisma.UserCreateManyInput[] = []

  function addUser(prefix: string, overrides: Partial<Prisma.UserCreateManyInput> = {}) {
    const id = uid()
    seq += 1
    users.push({
      id,
      email: `${prefix}${seq}@mail.utoronto.ca`,
      passwordHash,
      firstName: prefix.replace(/\d+$/, '') || 'Bench',
      lastName: `User${seq}`,
      phone: '+14165550100',
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
      university: University.UOFT,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      privacyAcceptedAt: new Date(),
      privacyVersion: PRIVACY_VERSION,
      ageAttestedAt: new Date(),
      stripeAccountId: 'acct_bench',
      stripeCustomerId: 'cus_bench',
      ...overrides,
    })
    return id
  }

  const renter = addUser('renter')
  const owner = addUser('owner')
  const admin = addUser('admin', { role: Role.ADMIN })
  const otherUser = addUser('other')
  const owners = [owner, ...Array.from({ length: 39 }, () => addUser('lender'))]
  const renters = Array.from({ length: N }, () => addUser('borrower'))
  const deletableUsers = Array.from({ length: N }, () => addUser('leaving'))
  const verifyUsers = Array.from({ length: N }, () => addUser('newbie', { verificationStatus: VerificationStatus.PENDING, verifiedAt: null }))
  const resendUsers = Array.from({ length: N }, () => addUser('waiting', { verificationStatus: VerificationStatus.PENDING, verifiedAt: null }))
  await prisma.user.createMany({ data: users })

  await prisma.verificationToken.createMany({
    data: verifyUsers.map((userId) => ({
      userId,
      code: '123456',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    })),
  })

  // ── Listings: 10 per lender, 3 photos each, scattered around downtown Toronto.
  const listings: Prisma.ListingCreateManyInput[] = []
  const images: Prisma.ListingImageCreateManyInput[] = []
  const listingsByOwner = new Map<string, string[]>()
  function addListing(ownerId: string, i: number) {
    const id = uid()
    listings.push({
      id,
      title: `${CATEGORIES[i % CATEGORIES.length]} item ${i}`,
      description: 'Well kept and ready to lend. Pick up near campus, evenings work best for me.',
      category: CATEGORIES[i % CATEGORIES.length],
      dailyPrice: new Prisma.Decimal(5 + (i % 60)),
      itemValue: new Prisma.Decimal(300),
      depositAmount: new Prisma.Decimal(50),
      latitude: 43.66 + ((i * 37) % 100) / 1000 - 0.05,
      longitude: -79.39 + ((i * 53) % 100) / 1000 - 0.05,
      city: 'Toronto',
      address: `${100 + i} College St`,
      ownerId,
      avgRating: 4.5,
      reviewCount: i % 12,
    })
    for (let order = 0; order < 3; order += 1) {
      // Real, public Cloudinary demo images so on-device scroll runs decode
      // actual photos; a distinct version per listing keeps every URL (and
      // cache entry) unique, like real uploads.
      const photo = DEMO_PHOTOS[(i + order) % DEMO_PHOTOS.length]
      images.push({ listingId: id, order, url: `https://res.cloudinary.com/demo/image/upload/v${1000 + i}/${photo}.jpg` })
    }
    const list = listingsByOwner.get(ownerId) ?? []
    list.push(id)
    listingsByOwner.set(ownerId, list)
    return id
  }
  let listingIndex = 0
  for (const ownerId of owners) {
    for (let k = 0; k < 10; k += 1) addListing(ownerId, listingIndex++)
  }
  const deletableListings = Array.from({ length: N }, () => addListing(owner, listingIndex++))
  await prisma.listing.createMany({ data: listings })
  await prisma.listingImage.createMany({ data: images })

  const ownerListings = listingsByOwner.get(owner)!.slice(0, 10)
  const otherListings = owners.slice(1).flatMap((o) => listingsByOwner.get(o)!)

  // ── Bookings
  const bookings: Prisma.BookingCreateManyInput[] = []
  function addBooking(input: {
    renterId: string
    ownerId: string
    listingId: string
    status: BookingStatus
    start: number
    days?: number
    extra?: Partial<Prisma.BookingCreateManyInput>
  }) {
    const id = uid()
    const days = input.days ?? 3
    bookings.push({
      id,
      renterId: input.renterId,
      ownerId: input.ownerId,
      listingId: input.listingId,
      status: input.status,
      startDate: dayUtc(input.start),
      endDate: dayUtc(input.start + days - 1),
      totalPrice: new Prisma.Decimal(60),
      depositAmount: new Prisma.Decimal(50),
      commissionAmount: new Prisma.Decimal(7.5),
      ownerPayout: new Prisma.Decimal(52.5),
      hstAmount: new Prisma.Decimal(7.8),
      ...input.extra,
    })
    return id
  }

  const historyStatuses: BookingStatus[] = [
    BookingStatus.PENDING,
    BookingStatus.ACCEPTED,
    BookingStatus.CONFIRMED,
    BookingStatus.ACTIVE,
    BookingStatus.COMPLETED,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.DECLINED,
  ]
  // The main renter's history (GET /bookings/me) and the main owner's inbox
  // (GET /bookings/requests): 80 each, every status.
  let renterBooking = ''
  for (let i = 0; i < 80; i += 1) {
    const id = addBooking({
      renterId: renter,
      ownerId: owners[1 + (i % 39)],
      listingId: otherListings[i],
      status: historyStatuses[i % historyStatuses.length],
      start: -200 + i * 4,
    })
    if (i === 4) renterBooking = id
  }
  let completedBooking = ''
  for (let i = 0; i < 80; i += 1) {
    const id = addBooking({
      renterId: renters[i % N],
      ownerId: owner,
      listingId: ownerListings[i % 10],
      status: historyStatuses[i % historyStatuses.length],
      start: -400 + i * 5,
      extra: historyStatuses[i % historyStatuses.length] === BookingStatus.COMPLETED
        ? { completedAt: dayUtc(-400 + i * 5 + 3), pickupPhotos: ['https://res.cloudinary.com/zoinkbench/image/upload/a.jpg'], returnPhotos: ['https://res.cloudinary.com/zoinkbench/image/upload/b.jpg'] }
        : {},
    })
    if (i === 4) completedBooking = id
  }
  // Background volume so the hot indexes aren't scanning a toy table.
  for (let i = 0; i < 1000; i += 1) {
    addBooking({
      renterId: renters[i % N],
      ownerId: owners[1 + (i % 39)],
      listingId: otherListings[i % otherListings.length],
      status: historyStatuses[i % historyStatuses.length],
      start: -600 + (i % 300),
    })
  }

  // Write fixtures, one per measured request. Each sits in its own future week
  // on one of the owner's listings so date-overlap checks never trip.
  let week = 0
  const nextWeek = () => 30 + 7 * week++
  const fixture = (status: BookingStatus, extra: (id: string) => Partial<Prisma.BookingCreateManyInput> = () => ({})) =>
    Array.from({ length: N }, (_, i) => {
      const id = uid()
      bookings.push({
        id,
        renterId: renters[i],
        ownerId: owner,
        listingId: ownerListings[i % 10],
        status,
        startDate: dayUtc(nextWeek()),
        endDate: dayUtc(week * 7 + 30 - 5),
        totalPrice: new Prisma.Decimal(60),
        depositAmount: new Prisma.Decimal(50),
        commissionAmount: new Prisma.Decimal(7.5),
        ownerPayout: new Prisma.Decimal(52.5),
        hstAmount: new Prisma.Decimal(7.8),
        ...extra(id),
      })
      return id
    })

  const photosFor = (id: string) => [
    `https://res.cloudinary.com/zoinkbench/image/upload/v1/bookings/booking_${id}_1.jpg`,
    `https://res.cloudinary.com/zoinkbench/image/upload/v1/bookings/booking_${id}_2.jpg`,
  ]
  const accept = fixture(BookingStatus.PENDING)
  const decline = fixture(BookingStatus.PENDING)
  const cancel = fixture(BookingStatus.PENDING)
  const paymentIntent = fixture(BookingStatus.ACCEPTED)
  const confirm = fixture(BookingStatus.ACCEPTED, (id) => ({
    paymentStatus: PaymentStatus.AUTHORIZED,
    stripePaymentIntentId: `pi_bench_${id}`,
  }))
  const pickupInitiate = fixture(BookingStatus.CONFIRMED, (id) => ({
    paymentStatus: PaymentStatus.AUTHORIZED,
    stripePaymentIntentId: `pi_bench_${id}`,
    depositStatus: DepositStatus.AUTHORIZED,
  }))
  const pickupTap = fixture(BookingStatus.PICKUP_PENDING, (id) => ({
    paymentStatus: PaymentStatus.AUTHORIZED,
    stripePaymentIntentId: `pi_bench_${id}`,
    pickupPhotos: photosFor(id),
    handoffInitiatedAt: new Date(),
  }))
  const returnInitiate = fixture(BookingStatus.ACTIVE, (id) => ({
    paymentStatus: PaymentStatus.CAPTURED,
    stripePaymentIntentId: `pi_bench_${id}`,
  }))
  const disputeCreate = fixture(BookingStatus.COMPLETED, (id) => ({
    paymentStatus: PaymentStatus.PAYOUT_PENDING,
    stripePaymentIntentId: `pi_bench_${id}`,
    completedAt: new Date(Date.now() - 60 * 60 * 1000),
  }))
  const disputeResolveBookings = fixture(BookingStatus.COMPLETED, (id) => ({
    paymentStatus: PaymentStatus.PAYOUT_PENDING,
    stripePaymentIntentId: `pi_bench_${id}`,
    completedAt: new Date(Date.now() - 60 * 60 * 1000),
    disputeStatus: 'OPEN',
  }))
  const reviewBookings = fixture(BookingStatus.COMPLETED, () => ({ completedAt: new Date(Date.now() - 60 * 60 * 1000) }))
  const webhookBookings = fixture(BookingStatus.ACCEPTED, (id) => ({ stripePaymentIntentId: `pi_bench_${id}` }))
  await prisma.booking.createMany({ data: bookings })

  // ── Disputes and reports
  const dispute = uid()
  const disputeResolve = disputeResolveBookings.map(() => uid())
  await prisma.dispute.createMany({
    data: [
      { id: dispute, bookingId: completedBooking, raisedByUserId: renters[4 % N], reason: 'ITEM_DAMAGED', description: 'The lens has a new scratch on it.' },
      ...disputeResolveBookings.map((bookingId, i) => ({
        id: disputeResolve[i],
        bookingId,
        raisedByUserId: renters[i],
        reason: 'ITEM_DAMAGED' as const,
        description: 'Came back with a cracked case and a missing cable.',
      })),
    ],
  })
  const reportResolve = Array.from({ length: N }, () => uid())
  await prisma.report.createMany({
    data: reportResolve.map((id, i) => ({
      id,
      reporterId: renters[i],
      targetType: 'LISTING' as const,
      targetId: otherListings[i],
      reason: 'SPAM' as const,
      description: 'Looks like the same listing posted over and over.',
    })),
  })

  // ── Review obligations (both sides of each completed fixture)
  const reviewObligations = reviewBookings.map(() => uid())
  await prisma.reviewObligation.createMany({
    data: reviewBookings.flatMap((bookingId, i) => [
      { id: reviewObligations[i], bookingId, userId: renters[i], targetUserId: owner, reviewerRole: ReviewRole.RENTER },
      { bookingId, userId: owner, targetUserId: renters[i], reviewerRole: ReviewRole.LENDER },
    ]),
  })

  // ── Conversations: the main renter has 40 threads of 30 messages, one with
  // 500. Each borrower has one thread with the owner for the message writes.
  const conversations: Prisma.ConversationCreateManyInput[] = []
  const messages: Prisma.MessageCreateManyInput[] = []
  const base = Date.now() - 30 * 24 * 60 * 60 * 1000
  function addConversation(renterId: string, ownerId: string, listingId: string, count: number) {
    const id = uid()
    conversations.push({ id, renterId, ownerId, listingId, renterLastReadAt: new Date(base) })
    for (let m = 0; m < count; m += 1) {
      messages.push({
        conversationId: id,
        senderId: m % 2 === 0 ? renterId : ownerId,
        body: `Message ${m}: is the item still available this weekend?`,
        createdAt: new Date(base + m * 60_000),
      })
    }
    return id
  }
  const bigConversation = addConversation(renter, owner, ownerListings[0], 500)
  for (let i = 0; i < 39; i += 1) addConversation(renter, owners[1 + i], otherListings[i * 10 + 1], 30)
  const messageConversations = renters.map((r, i) => addConversation(r, owner, ownerListings[(i + 1) % 10], 10))
  await prisma.conversation.createMany({ data: conversations })
  await prisma.message.createMany({ data: messages })

  // A few blocks so block filters have something to filter.
  await prisma.userBlock.createMany({
    data: [
      { blockerId: renter, blockedId: owners[39] },
      { blockerId: owners[38], blockedId: renter },
    ],
  })

  return {
    renter,
    owner,
    admin,
    otherUser,
    renters,
    ownerListings,
    browseListing: otherListings[100],
    bigConversation,
    renterBooking,
    completedBooking,
    dispute,
    accept,
    decline,
    cancel,
    paymentIntent,
    confirm,
    pickupInitiate,
    pickupTap,
    returnInitiate,
    disputeCreate,
    disputeResolve,
    reportResolve,
    reviewObligations,
    messageConversations,
    openConversationListings: otherListings.slice(200, 200 + N),
    bookingCreateListings: otherListings.slice(300, 300 + N),
    deletableListings,
    deletableUsers,
    verifyUsers,
    resendUsers,
    webhookBookings,
  }
}
