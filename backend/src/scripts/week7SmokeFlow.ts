/**
 * Backend smoke flow — full booking lifecycle in forced mock-Stripe mode.
 * =====================================================================
 * Walks the CURRENT flow end to end against the dev database, with no real
 * Stripe calls:
 *
 *   createBooking (PENDING)
 *     -> owner accepts (ACCEPTED)
 *     -> renter creates the payment intent (paymentStatus AUTHORIZED via the
 *        mock path)
 *     -> renter confirms payment (CONFIRMED; deposit PaymentIntent authorized)
 *     -> pickup handoff: owner photos + both Zoink-It taps (ACTIVE, rental
 *        "captured")
 *     -> return handoff: renter photos + both Zoink-It taps (COMPLETED,
 *        paymentStatus PAYOUT_PENDING, review obligations created)
 *
 * This is a quick "is the wiring intact" check for a human to eyeball — the
 * authoritative coverage lives in src/integration-tests/*.integration.test.ts
 * (bookingLifecycle / bookingFullFlow walk the same path with real Stripe test
 * mode). Run with:  npm run smoke:week7
 */
import dotenv from 'dotenv'

dotenv.config()

// Force the smoke flow through the local mock Stripe path so it never charges.
process.env.STRIPE_SECRET_KEY = ''
process.env.DEV_STRIPE_ACCOUNT_ID ||= 'acct_dev_smoke'

async function main() {
  const { default: prisma } = await import('../utils/prisma')
  const { VerificationStatus } = await import('@prisma/client')
  const bookingService = await import('../services/bookingService')
  const handoffService = await import('../services/handoffService')

  const suffix = Date.now()
  const passwordHash = 'smoke-not-a-real-password'

  const owner = await prisma.user.create({
    data: {
      email: `smoke-owner-${suffix}@example.com`,
      passwordHash,
      firstName: 'Smoke',
      lastName: 'Owner',
      phone: '+14165550101',
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
      stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID,
    },
  })

  const renter = await prisma.user.create({
    data: {
      email: `smoke-renter-${suffix}@example.com`,
      passwordHash,
      firstName: 'Smoke',
      lastName: 'Renter',
      phone: '+14165550102',
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  })

  const listing = await prisma.listing.create({
    data: {
      title: `Smoke Camera ${suffix}`,
      description: 'Temporary listing for payment and Zoink It smoke testing.',
      category: 'Cameras',
      dailyPrice: 20,
      itemValue: 500,
      depositAmount: 25,
      city: 'Toronto',
      latitude: 43.6532,
      longitude: -79.3832,
      ownerId: owner.id,
    },
  })

  const startDate = new Date()
  startDate.setUTCDate(startDate.getUTCDate() + 1)
  startDate.setUTCHours(0, 0, 0, 0)
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + 1)

  const created: any = await bookingService.createBooking(renter.id, {
    listingId: listing.id,
    startDate,
    endDate,
    message: 'Smoke test booking',
    insuranceOptIn: true,
  })
  console.log('created', {
    id: created.id,
    status: created.status,
    paymentStatus: created.paymentStatus,
    insuranceFee: created.insuranceFee,
  })

  const accepted: any = await bookingService.transitionBookingStatus(created.id, owner.id, 'ACCEPTED')
  console.log('accepted', { status: accepted.status, paymentStatus: accepted.paymentStatus })
  if (accepted.status !== 'ACCEPTED') throw new Error(`Expected ACCEPTED, got ${accepted.status}`)

  // Renter pays: create the payment intent (mock path -> paymentStatus AUTHORIZED)…
  const withIntent: any = await bookingService.createPaymentIntentForBooking(created.id, renter.id)
  console.log('payment-intent', {
    status: withIntent.status,
    paymentStatus: withIntent.paymentStatus,
    stripePaymentIntentId: withIntent.stripePaymentIntentId,
  })
  if (withIntent.paymentStatus !== 'AUTHORIZED') {
    throw new Error(`Expected AUTHORIZED after createPaymentIntentForBooking, got ${withIntent.paymentStatus}`)
  }

  // …then confirm -> CONFIRMED, deposit PaymentIntent authorized as its own hold.
  const confirmed: any = await bookingService.transitionBookingStatus(created.id, renter.id, 'CONFIRMED')
  console.log('confirmed', {
    status: confirmed.status,
    paymentStatus: confirmed.paymentStatus,
    depositStatus: confirmed.depositStatus,
    stripeDepositPaymentIntentId: confirmed.stripeDepositPaymentIntentId,
  })
  if (confirmed.status !== 'CONFIRMED') throw new Error(`Expected CONFIRMED, got ${confirmed.status}`)
  if (confirmed.depositStatus !== 'AUTHORIZED') {
    throw new Error(`Expected depositStatus AUTHORIZED after CONFIRMED, got ${confirmed.depositStatus}`)
  }

  // Pickup handoff: owner uploads photos, then both parties tap Zoink It.
  await handoffService.uploadHandoffPhotos(created.id, owner.id, 'pickup', [
    'https://example.com/pickup-owner-1.jpg',
    'https://example.com/pickup-owner-2.jpg',
  ])
  const pickupOwnerTap: any = await handoffService.registerTap(created.id, owner.id, 'pickup')
  console.log('pickup owner tap', {
    status: pickupOwnerTap.status,
    ownerPickupTappedAt: pickupOwnerTap.ownerPickupTappedAt,
    renterPickupTappedAt: pickupOwnerTap.renterPickupTappedAt,
  })
  const active: any = await handoffService.registerTap(created.id, renter.id, 'pickup')
  console.log('pickup synchronized', { status: active.status, paymentStatus: active.paymentStatus })
  if (active.status !== 'ACTIVE') {
    throw new Error(`Expected ACTIVE after synchronized pickup, got ${active.status}`)
  }

  // In production the payment_intent.succeeded webhook flips CAPTURE_PENDING ->
  // CAPTURED. There is no webhook in this offline smoke flow, so stand in for it
  // here so the return handoff can move the booking to PAYOUT_PENDING.
  await prisma.booking.update({ where: { id: created.id }, data: { paymentStatus: 'CAPTURED' } })

  // Return handoff: renter uploads photos, then both parties tap Zoink It.
  await handoffService.uploadHandoffPhotos(created.id, renter.id, 'return', [
    'https://example.com/return-renter-1.jpg',
    'https://example.com/return-renter-2.jpg',
  ])
  const returnRenterTap: any = await handoffService.registerTap(created.id, renter.id, 'return')
  console.log('return renter tap', {
    status: returnRenterTap.status,
    ownerReturnTappedAt: returnRenterTap.ownerReturnTappedAt,
    renterReturnTappedAt: returnRenterTap.renterReturnTappedAt,
  })
  const completed: any = await handoffService.registerTap(created.id, owner.id, 'return')
  console.log('return synchronized', { status: completed.status, paymentStatus: completed.paymentStatus })
  if (completed.status !== 'COMPLETED') {
    throw new Error(`Expected COMPLETED after synchronized return, got ${completed.status}`)
  }
  if (completed.paymentStatus !== 'PAYOUT_PENDING') {
    throw new Error(`Expected paymentStatus PAYOUT_PENDING after COMPLETED, got ${completed.paymentStatus}`)
  }

  const obligations = await prisma.reviewObligation.count({ where: { bookingId: created.id } })
  if (obligations !== 2) throw new Error(`Expected 2 review obligations after COMPLETED, got ${obligations}`)

  const events = await prisma.bookingEvent.findMany({
    where: { bookingId: created.id },
    select: { type: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log('audit events', events.map((event) => event.type))
  console.log('smoke flow passed:', created.id)
}

main()
  .catch((error) => {
    console.error('smoke flow failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    const { default: prisma } = await import('../utils/prisma')
    await prisma.$disconnect()
  })
