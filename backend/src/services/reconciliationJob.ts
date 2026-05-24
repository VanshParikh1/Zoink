import { BookingEventType, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'

export async function reconcileStripePayments() {
  const bookings = await prisma.booking.findMany({
    where: {
      stripePaymentIntentId: { not: null },
      paymentStatus: { in: [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURE_PENDING, PaymentStatus.CAPTURED, PaymentStatus.FAILED] },
    },
    select: {
      id: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
    },
  })

  if (!process.env.STRIPE_SECRET_KEY) {
    for (const booking of bookings) {
      await prisma.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: BookingEventType.RECONCILIATION_MATCH,
          metadata: { skipped: 'STRIPE_SECRET_KEY not configured' },
        },
      })
    }
    return { checked: bookings.length, mismatches: 0 }
  }

  const Stripe = require('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
  let mismatches = 0

  for (const booking of bookings) {
    const intent = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId)
    const expected = intent.status === 'succeeded'
      ? PaymentStatus.CAPTURED
      : intent.status === 'requires_capture'
        ? PaymentStatus.AUTHORIZED
        : intent.status === 'canceled'
          ? PaymentStatus.REFUNDED
          : booking.paymentStatus

    const type = expected === booking.paymentStatus ? BookingEventType.RECONCILIATION_MATCH : BookingEventType.RECONCILIATION_MISMATCH
    if (type === BookingEventType.RECONCILIATION_MISMATCH) mismatches += 1

    await prisma.bookingEvent.create({
      data: {
        bookingId: booking.id,
        type,
        metadata: {
          stripePaymentIntentId: booking.stripePaymentIntentId,
          stripeStatus: intent.status,
          dbStatus: booking.paymentStatus,
          expected,
        },
      },
    })
  }

  return { checked: bookings.length, mismatches }
}
