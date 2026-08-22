/**
 * Integration Tests — Full Booking Lifecycle
 * ===========================================
 * Exercises the real booking → payment → handoff lifecycle end-to-end against
 * the zoink_test Postgres database and Stripe test mode.
 *
 * Happy-path sequence tested:
 *   create booking → owner accept → pickup handoff (photos + Zoink It tap)
 *   → ACTIVE rental → return handoff → COMPLETED → review obligations created
 *   → payout eligible (paymentStatus = PAYOUT_PENDING)
 *
 * All service functions are called directly (no HTTP) except where we also
 * want to verify the HTTP layer, in which case we use supertest.
 *
 * State pre-conditions for mid-flow tests are set up with direct Prisma writes
 * as documented in the spec — we never call transition functions out of order.
 */

import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  checkStripeConnectivity,
  getApp,
} from './setup'
import * as bookingService from '../services/bookingService'
import * as handoffService from '../services/handoffService'
import { PaymentStatus, BookingStatus } from '@prisma/client'

// notifyUser (services/notificationService.ts) is fire-and-forget (`void notifyUser(...)`)
// from the caller's perspective — it does its own async DB lookup before writing the
// Notification row, so it can land after the awaited call that triggered it returns.
// Tests asserting on notification counts need to poll rather than check immediately.
async function waitFor(check: () => Promise<boolean>, { timeoutMs = 1000, intervalMs = 25 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

// ── Module-level state shared across all tests in this file ──────────────────
let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()

  // Each test gets fresh users and a fresh listing so there's no cross-test
  // coupling. DEV_STRIPE_ACCOUNT_ID is intentionally left blank in .env.test
  // so that ensureOwnerStripeAccount() falls through to the devAccountId path
  // only if the env var is set. For accept-booking tests we set stripeAccountId
  // directly on the owner record instead.
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: null })
  renter = await createTestUser({ firstName: 'Renter' })
  const listing = await createTestListing(owner.id, { dailyPrice: 20, itemValue: 200, depositAmount: 18 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// ── Helper: set stripeAccountId on owner so accept doesn't fail ───────────────
async function giveOwnerStripeAccount(ownerId: string) {
  const db = getTestPrisma()
  // Accept-flow tests call ensureOwnerStripeAccount(), which makes a real
  // Stripe API call (accounts.retrieve) against this id. It must be a real,
  // fully-onboarded (payouts_enabled: true) Stripe Express test-mode Connect
  // account — a fake id causes a live StripePermissionError. Fail fast if
  // it's not configured rather than silently falling back to a fake value.
  const accountId = process.env.DEV_STRIPE_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'DEV_STRIPE_ACCOUNT_ID is not set in .env.test — required for accept-booking ' +
      'integration tests, which call the real Stripe Connect API. Set it to a real, ' +
      'fully-onboarded (payouts_enabled: true) Stripe Express test-mode account id.'
    )
  }
  await db.user.update({
    where: { id: ownerId },
    data: { stripeAccountId: accountId },
  })
  return accountId
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Booking creation
// ─────────────────────────────────────────────────────────────────────────────
describe('createBooking', () => {
  test('creates a PENDING booking with a price snapshot and no payment intent yet', async () => {
    const { startDate, endDate } = futureDates(2, 3) // 3-day rental @ $20/day = $60
    const result = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      message: 'Can I pick it up in the morning?',
      insuranceOptIn: false,
    })

    assert.equal(result.status, BookingStatus.PENDING)
    assert.equal(result.renterId, renter.id)
    assert.equal(result.ownerId, owner.id)
    assert.equal(result.listingId, listingId)
    assert.equal(result.totalPrice, 60) // 3 days × $20
    assert.equal(result.depositAmount, 18) // the listing's configured deposit, not a computed rate
    assert.ok(result.commissionAmount > 0, 'commission should be positive')
    assert.ok(result.ownerPayout > 0, 'ownerPayout should be positive')
    assert.equal(result.insuranceFee, 0)
    // Payment now only happens once the lender accepts and the borrower pays
    // on the Pay screen — createBooking no longer touches Stripe at all.
    assert.equal(result.stripePaymentIntentId, null, 'no payment intent should exist yet')
    assert.equal(result.paymentStatus, PaymentStatus.PENDING_AUTH)
    assert.equal(result.paymentClientSecret, undefined, 'no clientSecret until the Pay step')

    // Verify persisted in DB
    const db = getTestPrisma()
    const booking = await db.booking.findUniqueOrThrow({ where: { id: result.id } })
    assert.equal(booking.status, BookingStatus.PENDING)
    assert.equal(booking.stripePaymentIntentId, null)
  })

  test('creates a Conversation and posts the request message into it, rather than storing it on the booking', async () => {
    const { startDate, endDate } = futureDates(2, 3)
    const result = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      message: 'Can I pick it up in the morning?',
    })

    assert.ok(result.conversationId, 'booking should be linked to a conversation')

    const db = getTestPrisma()
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: result.conversationId! } })
    assert.equal(conversation.listingId, listingId)
    assert.equal(conversation.renterId, renter.id)
    assert.equal(conversation.ownerId, owner.id)

    const messages = await db.message.findMany({ where: { conversationId: conversation.id } })
    assert.equal(messages.length, 1)
    assert.equal(messages[0].body, 'Can I pick it up in the morning?')
    assert.equal(messages[0].senderId, renter.id)
  })

  test('reuses the existing conversation for a second booking on the same listing/renter pair', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const first = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const { startDate: s2, endDate: e2 } = futureDates(20, 2)
    const second = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(s2),
      endDate: new Date(e2),
    })

    assert.equal(first.conversationId, second.conversationId)
  })

  test('does not create a conversation message when no request message is provided', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const result = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const db = getTestPrisma()
    const messages = await db.message.findMany({ where: { conversationId: result.conversationId! } })
    assert.equal(messages.length, 0)
  })

  test('creates booking with insurance when insuranceOptIn=true', async () => {
    const { startDate, endDate } = futureDates(2, 1)
    const result = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      insuranceOptIn: true,
    })
    assert.ok(result.insuranceFee > 0, 'insurance fee should be positive when opted in')
    assert.equal(result.insuranceOptIn, true)
  })

  test('rejects booking own listing', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    await assert.rejects(
      () => bookingService.createBooking(owner.id, {
        listingId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /cannot book your own listing/i)
        return true
      }
    )
  })

  test('rejects booking unavailable listing', async () => {
    const db = getTestPrisma()
    await db.listing.update({ where: { id: listingId }, data: { isAvailable: false } })
    const { startDate, endDate } = futureDates(2, 2)
    await assert.rejects(
      () => bookingService.createBooking(renter.id, {
        listingId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /unavailable/i)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Owner accept / decline
// ─────────────────────────────────────────────────────────────────────────────
describe('owner accept / decline', () => {
  test('owner can accept a PENDING booking (transitions to ACCEPTED)', async () => {
    await giveOwnerStripeAccount(owner.id)

    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    // Ensure payment is marked authorized so accept doesn't reject
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    const accepted = await bookingService.transitionBookingStatus(
      booking.id, owner.id, BookingStatus.ACCEPTED
    )
    assert.equal(accepted.status, BookingStatus.ACCEPTED)

    // Verify persisted
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.ACCEPTED)

    // Booking events should include the STATUS_CHANGE event
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const statusEvents = events.filter((e: any) => e.type === 'STATUS_CHANGE')
    assert.ok(statusEvents.length >= 1, 'at least one STATUS_CHANGE event should exist')
  })

  test('owner accept fails when payment is not authorized', async () => {
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    // Force payment status back to PENDING_AUTH
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: PaymentStatus.PENDING_AUTH },
    })

    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED),
      (err: any) => {
        assert.equal(err.statusCode, 409)
        assert.match(err.message, /payment authorization is not ready/i)
        return true
      }
    )
  })

  test('owner can decline a PENDING booking', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const declined = await bookingService.transitionBookingStatus(
      booking.id, owner.id, BookingStatus.DECLINED
    )
    assert.equal(declined.status, BookingStatus.DECLINED)
  })

  test('renter cannot accept a booking (owner-only action)', async () => {
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const db = getTestPrisma()
    await db.booking.update({ where: { id: booking.id }, data: { paymentStatus: PaymentStatus.AUTHORIZED } })

    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, renter.id, BookingStatus.ACCEPTED),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        return true
      }
    )
  })

  test('invalid transition from DECLINED is rejected by state machine', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    await bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.DECLINED)

    // DECLINED → ACCEPTED is not a valid transition
    await assert.rejects(
      () => bookingService.transitionBookingStatus(booking.id, owner.id, BookingStatus.ACCEPTED),
      /BOOKING_INVALID_TRANSITION/
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pickup handoff — photos + Zoink It tap → ACTIVE
// ─────────────────────────────────────────────────────────────────────────────
describe('pickup handoff', () => {
  // Helper: creates a CONFIRMED booking ready for handoff (paid — pickup can
  // only start once the booking has cleared the ACCEPTED -> CONFIRMED payment
  // step). Sets up the CONFIRMED precondition with a direct write, same as
  // makeActiveBooking() below does for ACTIVE — the Pay screen's own request
  // -> accept -> pay -> confirm path is exercised separately in the
  // "confirm payment" tests, not re-walked here.
  async function makeAcceptedBooking() {
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(2, 2)
    const created = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: created.id },
      data: {
        status: BookingStatus.CONFIRMED,
        paymentStatus: PaymentStatus.AUTHORIZED,
        stripePaymentIntentId: `pi_mock_confirmed_${Date.now()}`,
        version: { increment: 1 },
      },
    })
    return bookingService.getBookingById(created.id, owner.id)
  }

  test('owner initiates pickup — booking moves to PICKUP_PENDING', async () => {
    const booking = await makeAcceptedBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]

    const updated = await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', photos)
    assert.equal(updated.status, BookingStatus.PICKUP_PENDING)
    assert.deepEqual(updated.pickupPhotos, photos)
    assert.ok(updated.handoffInitiatedAt, 'handoffInitiatedAt should be set')

    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.PICKUP_PENDING)
  })

  test('renter cannot initiate pickup (owner-only)', async () => {
    const booking = await makeAcceptedBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]
    await assert.rejects(
      () => handoffService.initiateHandoff(booking.id, renter.id, 'pickup', photos),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        assert.match(err.message, /owner/i)
        return true
      }
    )
  })

  test('initiateHandoff rejects fewer than 2 photos', async () => {
    const booking = await makeAcceptedBooking()
    await assert.rejects(
      () => handoffService.initiateHandoff(booking.id, owner.id, 'pickup', [
        'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      ]),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /2 to 3/i)
        return true
      }
    )
  })

  test('initiateHandoff rejects a phase that has not been reached yet', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(1, 1)
    const pendingBooking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: 40,
        depositAmount: 12,
        commissionAmount: 6,
        ownerPayout: 34,
        insuranceFee: 0,
        status: BookingStatus.PENDING,
        paymentStatus: PaymentStatus.AUTHORIZED,
      },
    })
    await assert.rejects(
      () => handoffService.initiateHandoff(pendingBooking.id, owner.id, 'pickup', [
        'https://res.cloudinary.com/test/image/upload/photo1.jpg',
        'https://res.cloudinary.com/test/image/upload/photo2.jpg',
      ]),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /not allowed/i)
        return true
      }
    )
  })

  test('owner can resubmit pickup photos while PICKUP_PENDING without re-notifying the renter', async () => {
    const booking = await makeAcceptedBooking()
    const firstPhotos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]
    const db = getTestPrisma()
    // makeAcceptedBooking() also fires an (also fire-and-forget) "Booking accepted"
    // notification, so scope to the phase-specific "Time to Zoink It" notification
    // rather than a raw count — otherwise this races against that unrelated write.
    const countZoinkItNotifications = async () => {
      const rows = await db.notification.findMany({ where: { userId: renter.id } })
      return rows.filter((n: any) => n.data && (n.data as any).phase === 'pickup').length
    }

    // Booking creation and owner-acceptance each write their own STATUS_CHANGE event
    // for this same booking, so baseline against that instead of assuming 0.
    const statusChangeBaseline = await db.bookingEvent.count({ where: { bookingId: booking.id, type: 'STATUS_CHANGE' } })

    const first = await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', firstPhotos)
    assert.equal(first.status, BookingStatus.PICKUP_PENDING)

    const gotFirstNotification = await waitFor(async () => (await countZoinkItNotifications()) === 1)
    assert.ok(gotFirstNotification, 'first submission should notify the renter exactly once')

    const revisedPhotos = [
      'https://res.cloudinary.com/test/image/upload/photo1-retake.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
      'https://res.cloudinary.com/test/image/upload/photo3-new.jpg',
    ]
    const edited = await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', revisedPhotos)

    assert.equal(edited.status, BookingStatus.PICKUP_PENDING, 'status should not change on a photo edit')
    assert.deepEqual(edited.pickupPhotos, revisedPhotos, 'photos should be updated to the resubmitted set')

    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.deepEqual(persisted.pickupPhotos, revisedPhotos)
    assert.equal(persisted.status, BookingStatus.PICKUP_PENDING)

    // Give any (incorrect) duplicate notification a chance to land, then confirm the count held.
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(await countZoinkItNotifications(), 1, 'resubmitting photos should not send another notification')

    const statusChangeEventsAfter = await db.bookingEvent.count({ where: { bookingId: booking.id, type: 'STATUS_CHANGE' } })
    assert.equal(
      statusChangeEventsAfter,
      statusChangeBaseline + 1,
      'only the first submission should record a STATUS_CHANGE event, not the edit'
    )

    const uploadEvents = await db.bookingEvent.findMany({
      where: { bookingId: booking.id, type: 'UPLOAD_PHOTOS' },
    })
    assert.equal(uploadEvents.length, 2, 'both the initial submission and the edit should be audit-logged')
  })

  test('resubmitting photos after one party has already tapped does not clear that tap', async () => {
    const booking = await makeAcceptedBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', photos)

    const ownerTap = await handoffService.confirmHandoff(booking.id, owner.id, 'pickup')
    assert.equal(ownerTap.bothConfirmed, false)

    const db = getTestPrisma()
    const afterTap = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.ok(afterTap.ownerPickupTappedAt, 'owner tap should be recorded before the edit')

    const revisedPhotos = [
      'https://res.cloudinary.com/test/image/upload/photo1-retake.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', revisedPhotos)

    const afterEdit = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.ok(afterEdit.ownerPickupTappedAt, 'owner tap should survive a photo edit')
    assert.equal(
      afterEdit.ownerPickupTappedAt?.getTime(),
      afterTap.ownerPickupTappedAt?.getTime(),
      'the tap timestamp itself should be untouched by the edit'
    )

    // The renter can still tap afterwards and complete the synchronized confirmation.
    const renterTap = await handoffService.confirmHandoff(booking.id, renter.id, 'pickup')
    assert.equal(renterTap.bothConfirmed, true, 'the pre-edit tap should still count toward synchronization')
  })

  test('both tap Zoink It within window → booking moves to ACTIVE, payment captured', async () => {
    const booking = await makeAcceptedBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/photo1.jpg',
      'https://res.cloudinary.com/test/image/upload/photo2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, owner.id, 'pickup', photos)

    // Owner taps first
    const ownerTap = await handoffService.confirmHandoff(booking.id, owner.id, 'pickup')
    assert.equal(ownerTap.bothConfirmed, false, 'should not be confirmed until both tap')
    assert.equal(ownerTap.booking.status, BookingStatus.PICKUP_PENDING)

    // Renter taps within window — both confirmed
    const renterTap = await handoffService.confirmHandoff(booking.id, renter.id, 'pickup')
    assert.equal(renterTap.bothConfirmed, true)
    assert.equal(renterTap.booking.status, BookingStatus.ACTIVE)

    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.ACTIVE)
    // Payment should have been attempted to capture (CAPTURE_PENDING or CAPTURED or FAILED)
    const pickupAcceptableStatuses: PaymentStatus[] = [PaymentStatus.CAPTURE_PENDING, PaymentStatus.CAPTURED, PaymentStatus.FAILED]
    assert.ok(
      pickupAcceptableStatuses.includes(persisted.paymentStatus),
      `unexpected paymentStatus after pickup: ${persisted.paymentStatus}`
    )
    // BookingEvents should include ZOINK_TAP events
    const events = await db.bookingEvent.findMany({ where: { bookingId: booking.id } })
    const tapEvents = events.filter((e: any) => e.type === 'ZOINK_TAP')
    assert.ok(tapEvents.length >= 2, 'should have at least 2 ZOINK_TAP events')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Return handoff — photos + Zoink It tap → COMPLETED + payout eligible
// ─────────────────────────────────────────────────────────────────────────────
describe('return handoff and completion', () => {
  // Helper: creates a booking in ACTIVE state using direct Prisma writes for
  // the pre-condition (avoids walking through the full pickup flow in every
  // test, keeping each test focused on the return behaviour).
  async function makeActiveBooking() {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(2, 2)
    // Create booking directly
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: 40,
        depositAmount: 12,
        commissionAmount: 6,
        ownerPayout: 34,
        insuranceFee: 0,
        status: BookingStatus.ACTIVE,
        paymentStatus: PaymentStatus.CAPTURED,
        stripePaymentIntentId: `pi_mock_active_${Date.now()}`,
        pickupPhotos: [
          'https://res.cloudinary.com/test/image/upload/pickup1.jpg',
          'https://res.cloudinary.com/test/image/upload/pickup2.jpg',
        ],
      },
    })
    return booking
  }

  test('renter initiates return — booking moves to RETURN_PENDING', async () => {
    const booking = await makeActiveBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]

    const updated = await handoffService.initiateHandoff(booking.id, renter.id, 'return', photos)
    assert.equal(updated.status, BookingStatus.RETURN_PENDING)
    assert.deepEqual(updated.returnPhotos, photos)
    assert.ok(updated.returnInitiatedAt, 'returnInitiatedAt should be set')
  })

  test('owner cannot initiate return (renter-only)', async () => {
    const booking = await makeActiveBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    await assert.rejects(
      () => handoffService.initiateHandoff(booking.id, owner.id, 'return', photos),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        assert.match(err.message, /renter/i)
        return true
      }
    )
  })

  test('renter can resubmit return photos while RETURN_PENDING without re-notifying the owner', async () => {
    const booking = await makeActiveBooking()
    const firstPhotos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    const db = getTestPrisma()
    const countZoinkItNotifications = async () => {
      const rows = await db.notification.findMany({ where: { userId: owner.id } })
      return rows.filter((n: any) => n.data && (n.data as any).phase === 'return').length
    }

    await handoffService.initiateHandoff(booking.id, renter.id, 'return', firstPhotos)
    const gotFirstNotification = await waitFor(async () => (await countZoinkItNotifications()) === 1)
    assert.ok(gotFirstNotification, 'first submission should notify the owner exactly once')

    const revisedPhotos = [
      'https://res.cloudinary.com/test/image/upload/return1-retake.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    const edited = await handoffService.initiateHandoff(booking.id, renter.id, 'return', revisedPhotos)

    assert.equal(edited.status, BookingStatus.RETURN_PENDING)
    assert.deepEqual(edited.returnPhotos, revisedPhotos)

    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(await countZoinkItNotifications(), 1, 'resubmitting return photos should not send another notification')
  })

  test('both tap Zoink It for return → COMPLETED, review obligations created, paymentStatus PAYOUT_PENDING', async () => {
    const booking = await makeActiveBooking()
    const returnPhotos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, renter.id, 'return', returnPhotos)

    // Renter taps first
    const renterTap = await handoffService.confirmHandoff(booking.id, renter.id, 'return')
    assert.equal(renterTap.bothConfirmed, false)
    assert.equal(renterTap.booking.status, BookingStatus.RETURN_PENDING)

    // Owner taps within window
    const ownerTap = await handoffService.confirmHandoff(booking.id, owner.id, 'return')
    assert.equal(ownerTap.bothConfirmed, true)
    assert.equal(ownerTap.booking.status, BookingStatus.COMPLETED)
    assert.ok(ownerTap.booking.completedAt, 'completedAt should be set')

    const db = getTestPrisma()
    const persisted = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(persisted.status, BookingStatus.COMPLETED)
    assert.equal(persisted.paymentStatus, PaymentStatus.PAYOUT_PENDING)
    assert.ok(persisted.completedAt, 'completedAt should be persisted')

    // Review obligations should have been created for both participants
    const obligations = await db.reviewObligation.findMany({ where: { bookingId: booking.id } })
    assert.equal(obligations.length, 2, 'should create two review obligations')
    const renterObligation = obligations.find((o: any) => o.userId === renter.id)
    const ownerObligation = obligations.find((o: any) => o.userId === owner.id)
    assert.ok(renterObligation, 'renter review obligation should exist')
    assert.ok(ownerObligation, 'owner review obligation should exist')
    assert.equal(renterObligation?.status, 'PENDING')
    assert.equal(ownerObligation?.status, 'PENDING')
    assert.equal(renterObligation?.reviewerRole, 'RENTER')
    assert.equal(ownerObligation?.reviewerRole, 'LENDER')
  })

  test('tap after window has expired — single tap does not complete booking', async () => {
    const db = getTestPrisma()
    const booking = await makeActiveBooking()
    const photos = [
      'https://res.cloudinary.com/test/image/upload/return1.jpg',
      'https://res.cloudinary.com/test/image/upload/return2.jpg',
    ]
    await handoffService.initiateHandoff(booking.id, renter.id, 'return', photos)

    // Simulate renter tapped long ago (beyond the 5-minute window)
    await db.booking.update({
      where: { id: booking.id },
      data: { renterReturnTappedAt: new Date(Date.now() - 10 * 60 * 1000) }, // 10 min ago
    })

    // Owner taps now — window expired, so NOT both confirmed
    const ownerTap = await handoffService.confirmHandoff(booking.id, owner.id, 'return')
    assert.equal(ownerTap.bothConfirmed, false)
    assert.equal(ownerTap.booking.status, BookingStatus.RETURN_PENDING)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Full end-to-end happy path via HTTP (supertest)
// ─────────────────────────────────────────────────────────────────────────────
describe('full happy path via HTTP', () => {
  test('POST /bookings creates a PENDING booking with no payment intent yet', async () => {
    const app = getApp()
    const { startDate, endDate } = futureDates(3, 2)

    const res = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate, message: 'Test booking', insuranceOptIn: false })

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.status, 'PENDING')
    assert.ok(res.body.id, 'booking id should be present')
    assert.equal(res.body.stripePaymentIntentId, null, 'no payment intent until the Pay step')
    assert.ok(res.body.conversationId, 'booking should be linked to a conversation')
  })

  test('GET /bookings/:id returns booking for renter', async () => {
    const app = getApp()
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    assert.equal(createRes.status, 201)
    const bookingId = createRes.body.id

    const getRes = await supertest(app)
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(getRes.status, 200)
    assert.equal(getRes.body.id, bookingId)
    assert.equal(getRes.body.status, 'PENDING')
  })

  test('GET /bookings/:id returns 403 for unrelated user', async () => {
    const app = getApp()
    const stranger = await createTestUser({ email: `stranger_${Date.now()}@test.com` })
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    const getRes = await supertest(app)
      .get(`/bookings/${createRes.body.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)

    assert.equal(getRes.status, 403)
  })

  test('PATCH /bookings/:id/accept transitions to ACCEPTED', async () => {
    const app = getApp()
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    assert.equal(createRes.status, 201)
    const bookingId = createRes.body.id

    // Ensure payment is authorized
    const db = getTestPrisma()
    await db.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    const acceptRes = await supertest(app)
      .patch(`/bookings/${bookingId}/accept`)
      .set('Authorization', `Bearer ${owner.token}`)

    assert.equal(acceptRes.status, 200, `Expected 200, got ${acceptRes.status}: ${JSON.stringify(acceptRes.body)}`)
    assert.equal(acceptRes.body.status, 'ACCEPTED')
  })

  test('PATCH /bookings/:id/accept returns 403 when called by renter', async () => {
    const app = getApp()
    await giveOwnerStripeAccount(owner.id)
    const { startDate, endDate } = futureDates(3, 2)

    const createRes = await supertest(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${renter.token}`)
      .send({ listingId, startDate, endDate })

    const db = getTestPrisma()
    await db.booking.update({
      where: { id: createRes.body.id },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    const res = await supertest(app)
      .patch(`/bookings/${createRes.body.id}/accept`)
      .set('Authorization', `Bearer ${renter.token}`)

    assert.equal(res.status, 403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Overlap detection
// ─────────────────────────────────────────────────────────────────────────────
describe('booking overlap detection', () => {
  test('accepting a booking that overlaps with an existing ACCEPTED booking is rejected', async () => {
    await giveOwnerStripeAccount(owner.id)
    const db = getTestPrisma()

    // Both rentals use the same listing and overlapping dates
    const { startDate, endDate } = futureDates(5, 3)
    const renter2 = await createTestUser({ email: `renter2_${Date.now()}@test.com` })

    const b1 = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const b2 = await bookingService.createBooking(renter2.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    // Authorize both
    await db.booking.updateMany({
      where: { id: { in: [b1.id, b2.id] } },
      data: { paymentStatus: PaymentStatus.AUTHORIZED },
    })

    // Accept b1 — succeeds
    await bookingService.transitionBookingStatus(b1.id, owner.id, BookingStatus.ACCEPTED)

    // Accept b2 — should fail with 409 overlap
    await assert.rejects(
      () => bookingService.transitionBookingStatus(b2.id, owner.id, BookingStatus.ACCEPTED),
      (err: any) => {
        assert.equal(err.statusCode, 409)
        assert.match(err.message, /overlap/i)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. getBookingById and getMyBookings — data access controls
// ─────────────────────────────────────────────────────────────────────────────
describe('booking data access', () => {
  test('getBookingById returns correct data for renter with pendingReview=null when not completed', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })

    const result = await bookingService.getBookingById(booking.id, renter.id)
    assert.equal(result.id, booking.id)
    assert.equal(result.renterId, renter.id)
    assert.equal(result.pendingReview, null)
    // Numbers should be numbers, not Decimal objects
    assert.equal(typeof result.totalPrice, 'number')
    assert.equal(typeof result.depositAmount, 'number')
  })

  test('getMyBookings returns all bookings for renter', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const { startDate: s2, endDate: e2 } = futureDates(10, 2)
    await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(s2),
      endDate: new Date(e2),
    })

    const bookings = await bookingService.getMyBookings(renter.id)
    assert.equal(bookings.length, 2)
    assert.ok(bookings.every((b: any) => b.renterId === renter.id))
  })

  test('getBookingById throws 403 for non-participant', async () => {
    const { startDate, endDate } = futureDates(2, 2)
    const booking = await bookingService.createBooking(renter.id, {
      listingId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    })
    const stranger = await createTestUser()
    await assert.rejects(
      () => bookingService.getBookingById(booking.id, stranger.id),
      (err: any) => {
        assert.equal(err.statusCode, 403)
        return true
      }
    )
  })

  test('review obligations are included in booking response after completion', async () => {
    const db = getTestPrisma()
    const { startDate, endDate } = futureDates(2, 2)

    // Build a COMPLETED booking with obligations via direct Prisma writes
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: 40,
        depositAmount: 12,
        commissionAmount: 6,
        ownerPayout: 34,
        insuranceFee: 0,
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        completedAt: new Date(),
      },
    })

    await db.reviewObligation.createMany({
      data: [
        { bookingId: booking.id, userId: renter.id, targetUserId: owner.id, reviewerRole: 'RENTER' },
        { bookingId: booking.id, userId: owner.id, targetUserId: renter.id, reviewerRole: 'LENDER' },
      ],
    })

    const result = await bookingService.getBookingById(booking.id, renter.id)
    assert.ok(Array.isArray(result.reviewObligations))
    assert.equal(result.reviewObligations.length, 2)

    // pendingReview should be populated for the renter
    assert.ok(result.pendingReview, 'pendingReview should be set for renter')
    assert.equal(result.pendingReview.reviewerRole, 'RENTER')
    assert.equal(result.pendingReview.reviewee.id, owner.id)
    // Score labels differ by role
    assert.ok('scoreAKey' in result.pendingReview.scoreLabels)
  })
})
