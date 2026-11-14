/**
 * Seeds a fixed App Store reviewer account plus enough surrounding data that
 * Home, Inbox, Bookings, Pay and Zoink It all have something to show, and a
 * second, empty reviewer account that exists only to try Delete account (the
 * main one is refused while an item is with someone or a dispute is open).
 *
 * Signup is locked to university domains and the OTP email may never reach a
 * reviewer, so App Review gets a pre-verified login instead. Idempotent: safe
 * to re-run any time — including after the reviewer exercises
 * Settings → Delete account, which anonymizes the row and frees the email, so
 * a re-run simply creates a fresh reviewer. Every run puts the Pay and Zoink It
 * bookings back to their starting state, even after they were paid or tapped:
 * their test-mode PaymentIntents are cancelled (or refunded) and the bookings
 * recreated. It refuses to touch Stripe with a live key.
 *
 * NEVER run automatically — it is not wired into build, start or migrate.
 *
 * Usage (local):
 *   REVIEWER_PASSWORD='<strong password>' DELETION_REVIEWER_PASSWORD='<another>' \
 *     npx ts-node src/scripts/seedReviewerAccount.ts
 *
 * Usage (Railway prod DB — copy DATABASE_URL from the Postgres service's
 * "Connect" tab, public network URL):
 *   DATABASE_URL='postgresql://...' REVIEWER_PASSWORD='<strong password>' \
 *     DELETION_REVIEWER_PASSWORD='<another>' npx ts-node src/scripts/seedReviewerAccount.ts --confirm-remote
 *
 * Screen-recording cast (recording@ / recording-delete@, own owner and listings):
 *   RECORDING_PASSWORD='<strong>' RECORDING_DELETE_PASSWORD='<another>' \
 *     npx ts-node src/scripts/seedReviewerAccount.ts --recording [--confirm-remote]
 *
 * Optional: REVIEWER_EMAIL (default reviewer@zoink.app), DELETION_REVIEWER_EMAIL
 * (default reviewer-delete@zoink.app).
 */
import dotenv from 'dotenv'
dotenv.config()

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { BookingStatus, DepositStatus, PaymentStatus, Prisma, ReviewObligationStatus, ReviewRole, VerificationStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'
import { getRentalDays, roundCurrency } from '../services/bookingUtils'
import { calculateCommission, calculateHst, calculateOwnerPayout } from '../services/paymentService'
import { submitReview } from '../services/reviewService'

export const DEFAULT_REVIEWER_EMAIL = 'reviewer@zoink.app'
export const DEFAULT_DELETION_REVIEWER_EMAIL = 'reviewer-delete@zoink.app'
export const OWNER_EMAIL = 'reviewer-owner@zoink.app'
// A second, disposable counterparty so the reviewer can demo Report / Block
// without hiding the main owner's listings and threads.
export const SECOND_USER_EMAIL = 'reviewer-neighbour@zoink.app'
// A separate cast for the App Review screen recording (--recording): its own
// owner, neighbour and listings, so seeding, paying or deleting one cast never
// touches the other's bookings, listings or chats.
export const RECORDING_EMAIL = 'recording@zoink.app'
export const RECORDING_DELETE_EMAIL = 'recording-delete@zoink.app'
export const RECORDING_OWNER_EMAIL = 'recording-owner@zoink.app'
export const RECORDING_SECOND_USER_EMAIL = 'recording-neighbour@zoink.app'
const MIN_PASSWORD_LENGTH = 12

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`

// Stable titles double as the idempotency key for listings (per owner).
const LISTINGS = [
  {
    key: 'camera',
    title: 'Canon EOS DSLR Camera Kit',
    description: 'DSLR with 18-55mm kit lens, two batteries, charger and a 64GB card. Great for events and campus photo projects.',
    category: 'Cameras',
    dailyPrice: 38,
    itemValue: 1000,
    depositAmount: 100,
    images: [img('photo-1519183071298-a2962feb14f4'), img('photo-1502920917128-1aa500764cbd')],
  },
  {
    key: 'speaker',
    title: 'JBL PartyBox Bluetooth Speaker',
    description: 'Loud portable speaker for parties, picnics and study-room events. Comes fully charged with the USB-C cable.',
    category: 'Audio/Video',
    dailyPrice: 25,
    itemValue: 400,
    depositAmount: 40,
    images: [img('photo-1608043152269-423dbba4e7e1'), img('photo-1545454675-3531b543be5d')],
  },
  {
    key: 'drill',
    title: 'DeWalt 20V Cordless Drill',
    description: 'Cordless drill/driver with two batteries and a bit set. Perfect for move-in day and dorm furniture.',
    category: 'Tools',
    dailyPrice: 12,
    itemValue: 200,
    depositAmount: 25,
    images: [img('photo-1572981779307-38b8cabb2407'), img('photo-1504148455328-c376907d081c')],
  },
  // Browse fillers: no bookings, just enough variety that Home, Search and
  // the category chips don't look empty.
  {
    key: 'tent',
    title: 'Coleman 4-Person Tent',
    description: 'Waterproof dome tent that sets up in ten minutes. Fits four sleeping bags. Footprint and stakes included.',
    category: 'Outdoors',
    dailyPrice: 15,
    itemValue: 250,
    depositAmount: 30,
    images: [img('photo-1504280390367-361c6d9f38f4')],
  },
  {
    key: 'bike',
    title: 'Single-Speed City Bike (Medium)',
    description: 'Light single-speed bike for getting around campus. Lock and front light included. Fits riders about 5\'6" to 6\'0".',
    category: 'Sports',
    dailyPrice: 14,
    itemValue: 600,
    depositAmount: 60,
    images: [img('photo-1485965120184-e220f721d03e'), img('photo-1571068316344-75bc76f77890')],
  },
  {
    key: 'projector',
    title: 'Portable Movie Projector',
    description: 'Projects up to 100" on any wall. HDMI and USB-C, built-in speaker. Great for residence movie nights.',
    category: 'Audio/Video',
    dailyPrice: 18,
    itemValue: 300,
    depositAmount: 40,
    images: [img('photo-1478720568477-152d9b164e26')],
  },
  {
    key: 'skis',
    title: 'All-Mountain Skis + Poles (170cm)',
    description: 'Freshly waxed skis with bindings set for boot size 26-28. Poles included. Perfect for a weekend at Blue Mountain.',
    category: 'Sports',
    dailyPrice: 20,
    itemValue: 500,
    depositAmount: 50,
    images: [img('photo-1551698618-1dfe5d97d256')],
  },
  {
    key: 'textbook',
    title: 'Calculus Textbook (8th ed.)',
    description: 'First-year calculus text, lightly highlighted. Rent it for the term instead of buying.',
    category: 'Books',
    dailyPrice: 2,
    itemValue: 120,
    depositAmount: 0,
    images: [img('photo-1544716278-ca5e3f4abd8c')],
  },
] as const

// The reviewer's own listing, so the lender side (an incoming request to
// Accept or Decline) has something to show.
const REVIEWER_LISTING = {
  title: 'Nintendo Switch + 2 Controllers',
  description: 'Switch console with dock, two Joy-Con pairs and Mario Kart. Ideal for a games night.',
  category: 'Electronics',
  dailyPrice: 10,
  itemValue: 350,
  depositAmount: 40,
  images: [img('photo-1578303512597-81e6cc155b3e')],
}

const SECOND_USER_LISTING = {
  title: 'Canon Speedlite Flash',
  description: 'External flash for event photography. Batteries included.',
  category: 'Cameras',
  dailyPrice: 10,
  itemValue: 150,
  depositAmount: 20,
  images: [img('photo-1502920917128-1aa500764cbd')],
}

const PICKUP_PHOTOS = [img('photo-1607083206869-4c7672e72a8a'), img('photo-1495707902641-75cac588d2e9')]

function dayOffset(days: number) {
  const d = new Date()
  d.setUTCHours(12, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

function pricing(dailyPrice: number, depositAmount: number, startDate: Date, endDate: Date) {
  const totalPrice = roundCurrency(dailyPrice * getRentalDays(startDate, endDate))
  return {
    totalPrice: new Prisma.Decimal(totalPrice),
    depositAmount: new Prisma.Decimal(depositAmount),
    commissionAmount: new Prisma.Decimal(calculateCommission(totalPrice)),
    ownerPayout: new Prisma.Decimal(calculateOwnerPayout(totalPrice)),
    hstAmount: new Prisma.Decimal(calculateHst(totalPrice)),
  }
}

type Db = typeof prisma

/** The few Stripe calls a reset needs; tests pass a fake. */
export type SeedStripe = {
  paymentIntents: {
    retrieve(id: string): Promise<{ status: string; amount_received: number }>
    cancel(id: string): Promise<unknown>
  }
  refunds: { create(params: { payment_intent: string }): Promise<unknown> }
}

/** Stripe from STRIPE_SECRET_KEY, or null without one (local seeds have only
 *  mock PaymentIntents). A live key is refused: a reset cancels and refunds. */
export function seedStripeClient(key = process.env.STRIPE_SECRET_KEY): SeedStripe | null {
  if (!key) return null
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
    throw new Error('Refusing to reset reviewer bookings with a live Stripe key; the seed only runs in test mode.')
  }
  const Stripe = require('stripe')
  return new Stripe(key)
}

const CANCELLABLE_INTENT = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture', 'processing']

/** Cancels a held PaymentIntent, or refunds a captured one. One that Stripe
 *  doesn't have (a local mock id) or that's already cancelled is left alone. */
async function releaseIntent(stripe: SeedStripe, id: string) {
  let intent
  try {
    intent = await stripe.paymentIntents.retrieve(id)
  } catch (error: any) {
    if (error?.code === 'resource_missing') return
    throw error
  }
  if (CANCELLABLE_INTENT.includes(intent.status)) await stripe.paymentIntents.cancel(id)
  else if (intent.status === 'succeeded' && intent.amount_received > 0) {
    try {
      await stripe.refunds.create({ payment_intent: id })
    } catch (error: any) {
      if (error?.code !== 'charge_already_refunded') throw error
    }
  }
}

async function upsertVerifiedUser(
  db: Db,
  data: { email: string; firstName: string; lastName: string; phone: string; bio: string; avatarUrl: string; passwordHash: string },
) {
  const now = new Date()
  const fields = {
    passwordHash: data.passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    bio: data.bio,
    avatarUrl: data.avatarUrl,
    verificationStatus: VerificationStatus.VERIFIED,
    verifiedAt: now,
    termsAcceptedAt: now,
    termsVersion: CURRENT_TERMS_VERSION,
    privacyAcceptedAt: now,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    ageAttestedAt: now,
    deletedAt: null,
  }
  return db.user.upsert({
    where: { email: data.email },
    update: fields,
    create: { email: data.email, ...fields },
  })
}

export type SeedReviewerResult = {
  reviewer: { id: string; email: string }
  deletionReviewer: { id: string; email: string }
  owner: { id: string; email: string }
  secondUser: { id: string; email: string }
  listingIds: string[]
  bookings: { completed: string; accepted: string; pickupPending: string; incomingRequest: string }
}

export async function seedReviewerAccount(
  opts: {
    reviewerEmail: string
    reviewerPassword: string
    deletionReviewerEmail?: string
    deletionReviewerPassword: string
    ownerEmail?: string
    ownerName?: { firstName: string; lastName: string }
    secondUserEmail?: string
  },
  db: Db = prisma,
  stripe: SeedStripe | null = seedStripeClient(),
): Promise<SeedReviewerResult> {
  if (opts.reviewerPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`REVIEWER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (opts.deletionReviewerPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`DELETION_REVIEWER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }

  const reviewer = await upsertVerifiedUser(db, {
    email: opts.reviewerEmail,
    firstName: 'App',
    lastName: 'Reviewer',
    phone: '+14165550123',
    bio: 'Apple App Review demo account.',
    avatarUrl: img('photo-1500648767791-00dcc994a43e'),
    passwordHash: await bcrypt.hash(opts.reviewerPassword, 10),
  })

  // For Delete account only: no listings, bookings or disputes, so nothing
  // refuses the deletion. After a deletion, a re-run creates it afresh.
  const deletionReviewer = await upsertVerifiedUser(db, {
    email: opts.deletionReviewerEmail ?? DEFAULT_DELETION_REVIEWER_EMAIL,
    firstName: 'Delete',
    lastName: 'Tester',
    phone: '+14165550126',
    bio: 'Apple App Review demo account for trying Delete account.',
    avatarUrl: img('photo-1500648767791-00dcc994a43e'),
    passwordHash: await bcrypt.hash(opts.deletionReviewerPassword, 10),
  })

  // The owner never needs to log in — an unrecoverable random password.
  const owner = await upsertVerifiedUser(db, {
    email: opts.ownerEmail ?? OWNER_EMAIL,
    firstName: opts.ownerName?.firstName ?? 'Jordan',
    lastName: opts.ownerName?.lastName ?? 'Lee',
    phone: '+14165550124',
    bio: 'Film student who rents out gear between shoots.',
    avatarUrl: img('photo-1494790108377-be9c29b29330'),
    passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
  })

  const secondUser = await upsertVerifiedUser(db, {
    email: opts.secondUserEmail ?? SECOND_USER_EMAIL,
    firstName: 'Sam',
    lastName: 'Patel',
    phone: '+14165550125',
    bio: 'Photography club member.',
    avatarUrl: img('photo-1500648767791-00dcc994a43e'),
    passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
  })

  // The reviewer will likely try Block during review — a re-run restores the
  // demo by clearing any blocks among the seeded accounts.
  const seededIds = [reviewer.id, owner.id, secondUser.id]
  await db.userBlock.deleteMany({ where: { blockerId: { in: seededIds }, blockedId: { in: seededIds } } })

  // ── Listings (with photos) ───────────────────────────────────────────────────
  async function upsertListing(ownerId: string, spec: {
    title: string; description: string; category: string; dailyPrice: number; itemValue: number; depositAmount: number; images: readonly string[]
  }) {
    const existing = await db.listing.findFirst({ where: { ownerId, title: spec.title }, select: { id: true } })
    const data = {
      title: spec.title,
      description: spec.description,
      category: spec.category,
      dailyPrice: new Prisma.Decimal(spec.dailyPrice),
      itemValue: new Prisma.Decimal(spec.itemValue),
      depositAmount: new Prisma.Decimal(spec.depositAmount),
      isAvailable: true,
      deletedAt: null,
      latitude: 43.6629,
      longitude: -79.3957,
      city: 'Toronto',
      ownerId,
    }
    const listing = existing
      ? await db.listing.update({ where: { id: existing.id }, data })
      : await db.listing.create({ data })

    await db.listingImage.deleteMany({ where: { listingId: listing.id } })
    await db.listingImage.createMany({
      data: spec.images.map((url, order) => ({ listingId: listing.id, url, order })),
    })
    return listing.id
  }

  const listings: Record<string, { id: string; dailyPrice: number; depositAmount: number }> = {}
  for (const spec of LISTINGS) {
    const id = await upsertListing(owner.id, spec)
    listings[spec.key] = { id, dailyPrice: spec.dailyPrice, depositAmount: spec.depositAmount }
  }
  const secondListingId = await upsertListing(secondUser.id, SECOND_USER_LISTING)

  // ── Conversations + one booking per listing ─────────────────────────────────
  // Each booking is keyed by (listing, renter). The completed one is kept as
  // is; the Pay and Zoink It ones are recreated on every run (fresh: true).
  async function ensureConversation(
    listingId: string,
    messages: { from: 'reviewer' | 'owner'; body: string }[],
    counterpartId: string = owner.id,
  ) {
    const conversation = await db.conversation.upsert({
      where: { listingId_renterId: { listingId, renterId: reviewer.id } },
      update: {},
      create: { listingId, renterId: reviewer.id, ownerId: counterpartId },
    })
    const count = await db.message.count({ where: { conversationId: conversation.id } })
    if (count === 0) {
      const base = Date.now() - messages.length * 15 * 60 * 1000
      for (const [i, m] of messages.entries()) {
        await db.message.create({
          data: {
            conversationId: conversation.id,
            senderId: m.from === 'reviewer' ? reviewer.id : counterpartId,
            body: m.body,
            createdAt: new Date(base + i * 15 * 60 * 1000),
          },
        })
      }
    }
    return conversation.id
  }

  /** Deletes these bookings, first releasing whatever was paid on them so no
   *  test-mode hold outlives its booking. Events, reviews and obligations cascade. */
  async function clearBookings(where: Prisma.BookingWhereInput) {
    const existing = await db.booking.findMany({
      where,
      select: { id: true, stripePaymentIntentId: true, stripeDepositPaymentIntentId: true },
    })
    for (const booking of existing) {
      for (const intentId of [booking.stripePaymentIntentId, booking.stripeDepositPaymentIntentId]) {
        if (intentId && stripe) await releaseIntent(stripe, intentId)
      }
    }
    const ids = existing.map((b) => b.id)
    await db.dispute.deleteMany({ where: { bookingId: { in: ids } } })
    await db.booking.deleteMany({ where: { id: { in: ids } } })
  }

  async function ensureBooking(
    key: keyof typeof listings,
    conversationId: string,
    build: () => Omit<Prisma.BookingUncheckedCreateInput, 'listingId' | 'renterId' | 'ownerId' | 'conversationId'>,
    fresh = false,
  ) {
    const listing = listings[key]
    const spec = build()
    if (!fresh) {
      // Match on status: the reviewer may have sent their own request for
      // the same listing, which must not stand in for the seeded booking.
      const keep = await db.booking.findFirst({
        where: { listingId: listing.id, renterId: reviewer.id, status: spec.status },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })
      if (keep) return keep.id
    } else {
      await clearBookings({ listingId: listing.id, renterId: reviewer.id })
    }

    const data = { ...spec, listingId: listing.id, renterId: reviewer.id, ownerId: owner.id, conversationId }
    const created = await db.booking.create({ data })
    return created.id
  }

  // 1. Past, completed rental — booking history.
  const drillConvo = await ensureConversation(listings.drill.id, [
    { from: 'reviewer', body: 'Hi! Could I borrow the drill this weekend to put together a desk?' },
    { from: 'owner', body: 'Sure — it comes with two batteries. Pickup near Robarts works?' },
    { from: 'reviewer', body: 'Returned it, thanks so much!' },
  ])
  const completedStart = dayOffset(-10)
  const completedEnd = dayOffset(-9)
  const completed = await ensureBooking('drill', drillConvo, () => ({
    status: BookingStatus.COMPLETED,
    startDate: completedStart,
    endDate: completedEnd,
    completedAt: completedEnd,
    paymentStatus: PaymentStatus.PAID_OUT,
    paidAt: completedStart,
    ...pricing(listings.drill.dailyPrice, listings.drill.depositAmount, completedStart, completedEnd),
  }))
  // A review each way, submitted through the real service so reputations and
  // the listing's rating are computed as in the app. Both are submitted, so no
  // "leave a review" prompt pops up on login.
  await db.reviewObligation.createMany({
    data: [
      { bookingId: completed, userId: reviewer.id, targetUserId: owner.id, reviewerRole: ReviewRole.RENTER },
      { bookingId: completed, userId: owner.id, targetUserId: reviewer.id, reviewerRole: ReviewRole.LENDER },
    ],
    skipDuplicates: true,
  })
  const openReviews = await db.reviewObligation.findMany({ where: { bookingId: completed, status: ReviewObligationStatus.PENDING } })
  for (const o of openReviews) {
    await submitReview(
      o.userId,
      o.reviewerRole === ReviewRole.RENTER
        ? { obligationId: o.id, reviewerRole: o.reviewerRole, scoreA: 5, scoreB: 5, scoreC: 5, itemRating: 5, itemNotes: 'Both batteries were charged and the bit set was complete. Made my desk build easy.' }
        : { obligationId: o.id, reviewerRole: o.reviewerRole, scoreA: 5, scoreB: 5, scoreC: 4, personNotes: 'Returned on time and in the same condition. Would lend to again.' },
    )
  }

  // 2. Accepted, awaiting payment — "Pay now" leads straight to the Pay
  //    screen, where a Stripe test card (4242 4242 4242 4242) completes it.
  const speakerConvo = await ensureConversation(listings.speaker.id, [
    { from: 'reviewer', body: 'Is the speaker free tomorrow for a club event?' },
    { from: 'owner', body: 'It is! I accepted your request — go ahead and pay whenever you are ready.' },
  ])
  // Starts tomorrow: the speaker has a deposit, and a booking with a deposit
  // can only be paid from 00:00 Toronto time the day before it starts
  // (@zoink/shared deposits.ts). Re-run the seed shortly before submitting
  // for review (in Toronto daytime) so the reviewer can pay straight away.
  const acceptedStart = dayOffset(1)
  const acceptedEnd = dayOffset(2)
  const accepted = await ensureBooking(
    'speaker',
    speakerConvo,
    () => ({
      status: BookingStatus.ACCEPTED,
      startDate: acceptedStart,
      endDate: acceptedEnd,
      paymentStatus: PaymentStatus.PENDING_AUTH,
      ...pricing(listings.speaker.dailyPrice, listings.speaker.depositAmount, acceptedStart, acceptedEnd),
    }),
    true,
  )

  // 3. Pickup documented by the owner today — Zoink It shows the owner's
  //    condition photos and the reviewer's confirm step.
  const cameraConvo = await ensureConversation(listings.camera.id, [
    { from: 'reviewer', body: 'Picking up the camera today for a photo assignment — see you at 5?' },
    { from: 'owner', body: 'Perfect. I just took the handoff photos in the app, tap Zoink It when you have it.' },
  ])
  const pickupStart = dayOffset(0)
  const pickupEnd = dayOffset(1)
  const pickupPending = await ensureBooking(
    'camera',
    cameraConvo,
    () => ({
      status: BookingStatus.PICKUP_PENDING,
      startDate: pickupStart,
      endDate: pickupEnd,
      // Pickup needs the rent and the deposit held (isPickupPaymentReady).
      // Nothing is captured: the owner never taps, so the reviewer's tap only
      // records their side of the handoff.
      paymentStatus: PaymentStatus.AUTHORIZED,
      depositStatus: DepositStatus.AUTHORIZED,
      paidAt: new Date(),
      pickupPhotos: [...PICKUP_PHOTOS],
      handoffInitiatedAt: new Date(),
      ownerPickupTappedAt: null,
      renterPickupTappedAt: null,
      ...pricing(listings.camera.dailyPrice, listings.camera.depositAmount, pickupStart, pickupEnd),
    }),
    true,
  )

  // 4. A thread with the second user — the one to long-press → Report
  //    message, or ⋮ → Block, during the review recording.
  await ensureConversation(
    secondListingId,
    [
      { from: 'reviewer', body: 'Hi, is the flash still available this Friday?' },
      { from: 'owner', body: 'Yes — but pay me cash outside the app and I will knock $5 off.' },
    ],
    secondUser.id,
  )

  // 5. The lender side: the owner has requested the reviewer's own listing,
  //    so Accept / Decline has something to act on. Recreated every run.
  const ownListingId = await upsertListing(reviewer.id, REVIEWER_LISTING)
  const requestConvo = await db.conversation.upsert({
    where: { listingId_renterId: { listingId: ownListingId, renterId: owner.id } },
    update: {},
    create: { listingId: ownListingId, renterId: owner.id, ownerId: reviewer.id },
  })
  if ((await db.message.count({ where: { conversationId: requestConvo.id } })) === 0) {
    await db.message.create({
      data: { conversationId: requestConvo.id, senderId: owner.id, body: 'Hey! Could I borrow the Switch for a games night this weekend? Just sent a request.' },
    })
  }
  await clearBookings({ listingId: ownListingId, renterId: owner.id })
  const requestStart = dayOffset(4)
  const requestEnd = dayOffset(6)
  const incomingRequest = (
    await db.booking.create({
      data: {
        status: BookingStatus.PENDING,
        startDate: requestStart,
        endDate: requestEnd,
        paymentStatus: PaymentStatus.PENDING_AUTH,
        ...pricing(REVIEWER_LISTING.dailyPrice, REVIEWER_LISTING.depositAmount, requestStart, requestEnd),
        listingId: ownListingId,
        renterId: owner.id,
        ownerId: reviewer.id,
        conversationId: requestConvo.id,
      },
    })
  ).id

  return {
    reviewer: { id: reviewer.id, email: reviewer.email },
    deletionReviewer: { id: deletionReviewer.id, email: deletionReviewer.email },
    owner: { id: owner.id, email: owner.email },
    secondUser: { id: secondUser.id, email: secondUser.email },
    listingIds: [...Object.values(listings).map((l) => l.id), secondListingId, ownListingId],
    bookings: { completed, accepted, pickupPending, incomingRequest },
  }
}

/** Options for the screen-recording cast; fixed emails, never the reviewer's. */
export function recordingSeedOptions(password: string, deletionPassword: string) {
  return {
    reviewerEmail: RECORDING_EMAIL,
    reviewerPassword: password,
    deletionReviewerEmail: RECORDING_DELETE_EMAIL,
    deletionReviewerPassword: deletionPassword,
    ownerEmail: RECORDING_OWNER_EMAIL,
    ownerName: { firstName: 'Maya', lastName: 'Singh' },
    secondUserEmail: RECORDING_SECOND_USER_EMAIL,
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function isLocalDatabase(url: string) {
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

async function main() {
  const recording = process.argv.includes('--recording')
  const [passwordVar, deletionPasswordVar] = recording
    ? ['RECORDING_PASSWORD', 'RECORDING_DELETE_PASSWORD']
    : ['REVIEWER_PASSWORD', 'DELETION_REVIEWER_PASSWORD']
  const password = process.env[passwordVar] ?? ''
  const deletionPassword = process.env[deletionPasswordVar] ?? ''
  const dbUrl = process.env.DATABASE_URL ?? ''

  if (!password || !deletionPassword) {
    console.error(`${passwordVar} and ${deletionPasswordVar} are required (never commit them — pass them inline or via your shell).`)
    process.exit(1)
  }
  if (!isLocalDatabase(dbUrl) && !process.argv.includes('--confirm-remote')) {
    console.error(
      `Refusing to seed a non-local database (${dbUrl ? new URL(dbUrl).hostname : 'DATABASE_URL unset'}) ` +
        'without --confirm-remote.',
    )
    process.exit(1)
  }

  const result = await seedReviewerAccount(
    recording
      ? recordingSeedOptions(password, deletionPassword)
      : {
          reviewerEmail: process.env.REVIEWER_EMAIL?.trim() || DEFAULT_REVIEWER_EMAIL,
          reviewerPassword: password,
          deletionReviewerEmail: process.env.DELETION_REVIEWER_EMAIL?.trim() || undefined,
          deletionReviewerPassword: deletionPassword,
        },
  )
  console.log(recording ? 'Recording accounts ready.' : 'Reviewer accounts ready.')
  console.log(`  Login:          ${result.reviewer.email}  (password: the ${passwordVar} you supplied)`)
  console.log(`  Delete account: ${result.deletionReviewer.email}  (password: the ${deletionPasswordVar} you supplied)`)
  console.log(`  Owner account:  ${result.owner.email}  (not for login)`)
  console.log(`  Second user:    ${result.secondUser.email}  (not for login — use for Report/Block demo)`)
  console.log(`  Listings:       ${result.listingIds.length}`)
  console.log(`  Bookings:       completed ${result.bookings.completed}`)
  console.log(`                  accepted/awaiting payment ${result.bookings.accepted}`)
  console.log(`                  pickup pending (Zoink It) ${result.bookings.pickupPending}`)
  console.log(`                  incoming request (Accept/Decline) ${result.bookings.incomingRequest}`)
  await (prisma as any).$disconnect?.()
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err)
    await (prisma as any).$disconnect?.()
    process.exit(1)
  })
}
