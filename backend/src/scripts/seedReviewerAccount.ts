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
 * Optional: REVIEWER_EMAIL (default reviewer@zoink.app), DELETION_REVIEWER_EMAIL
 * (default reviewer-delete@zoink.app).
 */
import dotenv from 'dotenv'
dotenv.config()

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { BookingStatus, DepositStatus, PaymentStatus, Prisma, VerificationStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../config/legal'
import { getRentalDays, roundCurrency } from '../services/bookingUtils'
import { calculateCommission, calculateHst, calculateOwnerPayout } from '../services/paymentService'

export const DEFAULT_REVIEWER_EMAIL = 'reviewer@zoink.app'
export const DEFAULT_DELETION_REVIEWER_EMAIL = 'reviewer-delete@zoink.app'
export const OWNER_EMAIL = 'reviewer-owner@zoink.app'
// A second, disposable counterparty so the reviewer can demo Report / Block
// without hiding the main owner's listings and threads.
export const SECOND_USER_EMAIL = 'reviewer-neighbour@zoink.app'
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
] as const

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
  bookings: { completed: string; accepted: string; pickupPending: string }
}

export async function seedReviewerAccount(
  opts: { reviewerEmail: string; reviewerPassword: string; deletionReviewerEmail?: string; deletionReviewerPassword: string },
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
    email: OWNER_EMAIL,
    firstName: 'Jordan',
    lastName: 'Lee',
    phone: '+14165550124',
    bio: 'Film student who rents out gear between shoots.',
    avatarUrl: img('photo-1494790108377-be9c29b29330'),
    passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
  })

  const secondUser = await upsertVerifiedUser(db, {
    email: SECOND_USER_EMAIL,
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

  async function ensureBooking(
    key: keyof typeof listings,
    conversationId: string,
    build: () => Omit<Prisma.BookingUncheckedCreateInput, 'listingId' | 'renterId' | 'ownerId' | 'conversationId'>,
    fresh = false,
  ) {
    const listing = listings[key]
    const existing = await db.booking.findMany({
      where: { listingId: listing.id, renterId: reviewer.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, stripePaymentIntentId: true, stripeDepositPaymentIntentId: true },
    })
    if (existing.length > 0 && !fresh) return existing[0].id

    // Release whatever the reviewer paid before deleting, so no test-mode
    // hold outlives its booking. Events, reviews and obligations cascade.
    for (const booking of existing) {
      for (const intentId of [booking.stripePaymentIntentId, booking.stripeDepositPaymentIntentId]) {
        if (intentId && stripe) await releaseIntent(stripe, intentId)
      }
    }
    const ids = existing.map((b) => b.id)
    await db.dispute.deleteMany({ where: { bookingId: { in: ids } } })
    await db.booking.deleteMany({ where: { id: { in: ids } } })

    const data = { ...build(), listingId: listing.id, renterId: reviewer.id, ownerId: owner.id, conversationId }
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

  return {
    reviewer: { id: reviewer.id, email: reviewer.email },
    deletionReviewer: { id: deletionReviewer.id, email: deletionReviewer.email },
    owner: { id: owner.id, email: owner.email },
    secondUser: { id: secondUser.id, email: secondUser.email },
    listingIds: [...Object.values(listings).map((l) => l.id), secondListingId],
    bookings: { completed, accepted, pickupPending },
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
  const password = process.env.REVIEWER_PASSWORD ?? ''
  const deletionPassword = process.env.DELETION_REVIEWER_PASSWORD ?? ''
  const email = process.env.REVIEWER_EMAIL?.trim() || DEFAULT_REVIEWER_EMAIL
  const dbUrl = process.env.DATABASE_URL ?? ''

  if (!password || !deletionPassword) {
    console.error('REVIEWER_PASSWORD and DELETION_REVIEWER_PASSWORD are required (never commit them — pass them inline or via your shell).')
    process.exit(1)
  }
  if (!isLocalDatabase(dbUrl) && !process.argv.includes('--confirm-remote')) {
    console.error(
      `Refusing to seed a non-local database (${dbUrl ? new URL(dbUrl).hostname : 'DATABASE_URL unset'}) ` +
        'without --confirm-remote.',
    )
    process.exit(1)
  }

  const result = await seedReviewerAccount({
    reviewerEmail: email,
    reviewerPassword: password,
    deletionReviewerEmail: process.env.DELETION_REVIEWER_EMAIL?.trim() || undefined,
    deletionReviewerPassword: deletionPassword,
  })
  console.log('Reviewer accounts ready.')
  console.log(`  Login:          ${result.reviewer.email}  (password: the REVIEWER_PASSWORD you supplied)`)
  console.log(`  Delete account: ${result.deletionReviewer.email}  (password: the DELETION_REVIEWER_PASSWORD you supplied)`)
  console.log(`  Owner account:  ${result.owner.email}  (not for login)`)
  console.log(`  Second user:    ${result.secondUser.email}  (not for login — use for Report/Block demo)`)
  console.log(`  Listings:       ${result.listingIds.length}`)
  console.log(`  Bookings:       completed ${result.bookings.completed}`)
  console.log(`                  accepted/awaiting payment ${result.bookings.accepted}`)
  console.log(`                  pickup pending (Zoink It) ${result.bookings.pickupPending}`)
  await (prisma as any).$disconnect?.()
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err)
    await (prisma as any).$disconnect?.()
    process.exit(1)
  })
}
