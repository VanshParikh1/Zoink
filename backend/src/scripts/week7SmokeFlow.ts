import dotenv from 'dotenv'

dotenv.config()

// Force the smoke test through the local mock Stripe path so it never charges.
process.env.STRIPE_SECRET_KEY = ''
process.env.DEV_STRIPE_ACCOUNT_ID ||= 'acct_dev_week7_smoke'

async function main() {
  const { default: prisma } = await import('../utils/prisma')
  const { VerificationStatus } = await import('@prisma/client')
  const bookingService = await import('../services/bookingService')
  const handoffService = await import('../services/handoffService')

  const suffix = Date.now()
  const passwordHash = 'week7-smoke-not-a-real-password'

  const owner = await prisma.user.create({
    data: {
      email: `week7-owner-${suffix}@example.com`,
      passwordHash,
      firstName: 'Week7',
      lastName: 'Owner',
      phone: '+14165550101',
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
      stripeAccountId: process.env.DEV_STRIPE_ACCOUNT_ID,
    },
  })

  const renter = await prisma.user.create({
    data: {
      email: `week7-renter-${suffix}@example.com`,
      passwordHash,
      firstName: 'Week7',
      lastName: 'Renter',
      phone: '+14165550102',
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  })

  const listing = await prisma.listing.create({
    data: {
      title: `Week 7 Smoke Camera ${suffix}`,
      description: 'Temporary listing for payment and Zoink It smoke testing.',
      category: 'Cameras',
      dailyPrice: 20,
      itemValue: 500,
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

  await handoffService.uploadHandoffPhotos(created.id, owner.id, 'pickup', [
    'https://example.com/pickup-owner-1.jpg',
    'https://example.com/pickup-owner-2.jpg',
  ])
  const pickupOwnerTap: any = await handoffService.registerTap(created.id, owner.id, 'pickup')
  console.log('pickup owner tap', {
    status: pickupOwnerTap.status,
    paymentStatus: pickupOwnerTap.paymentStatus,
    ownerPickupTappedAt: pickupOwnerTap.ownerPickupTappedAt,
    renterPickupTappedAt: pickupOwnerTap.renterPickupTappedAt,
  })

  const active: any = await handoffService.registerTap(created.id, renter.id, 'pickup')
  console.log('pickup synchronized', { status: active.status, paymentStatus: active.paymentStatus })

  if (active.status !== 'ACTIVE') {
    throw new Error(`Expected ACTIVE after synchronized pickup, got ${active.status}`)
  }

  await prisma.booking.update({
    where: { id: created.id },
    data: { paymentStatus: 'CAPTURED' },
  })

  await handoffService.uploadHandoffPhotos(created.id, renter.id, 'return', [
    'https://example.com/return-renter-1.jpg',
    'https://example.com/return-renter-2.jpg',
  ])
  const returnOwnerTap: any = await handoffService.registerTap(created.id, owner.id, 'return')
  console.log('return owner tap', {
    status: returnOwnerTap.status,
    ownerReturnTappedAt: returnOwnerTap.ownerReturnTappedAt,
    renterReturnTappedAt: returnOwnerTap.renterReturnTappedAt,
  })

  const completed: any = await handoffService.registerTap(created.id, renter.id, 'return')
  console.log('return synchronized', { status: completed.status, paymentStatus: completed.paymentStatus })

  if (completed.status !== 'COMPLETED') {
    throw new Error(`Expected COMPLETED after synchronized return, got ${completed.status}`)
  }

  const events = await prisma.bookingEvent.findMany({
    where: { bookingId: created.id },
    select: { type: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log('audit events', events.map((event) => event.type))
  console.log('week7 smoke flow passed')
}

main()
  .catch((error) => {
    console.error('week7 smoke flow failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    const { default: prisma } = await import('../utils/prisma')
    await prisma.$disconnect()
  })
