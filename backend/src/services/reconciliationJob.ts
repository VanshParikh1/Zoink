import { BookingEventType, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { retrievePaymentIntent } from './paymentService'
import { recordJobFailure } from './cleanupJob'

// Hourly drift check between each in-flight booking's paymentStatus and its
// rental PaymentIntent in Stripe. Only disagreements are written to the
// booking's audit trail: writing a RECONCILIATION_MATCH row for every booking
// every hour grew booking_events without bound and buried real events in the
// admin timeline. Audit-only — it never changes booking state.
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
    return { checked: bookings.length, mismatches: 0, failed: 0 }
  }

  let mismatches = 0
  let failed = 0

  for (const booking of bookings) {
    try {
      const intent = await retrievePaymentIntent(booking.stripePaymentIntentId!)
      if (!intent) continue

      const expected = intent.status === 'succeeded'
        ? PaymentStatus.CAPTURED
        : intent.status === 'requires_capture'
          ? PaymentStatus.AUTHORIZED
          : intent.status === 'canceled'
            ? PaymentStatus.REFUNDED
            : booking.paymentStatus

      if (expected === booking.paymentStatus) continue

      mismatches += 1
      await prisma.bookingEvent.create({
        data: {
          bookingId: booking.id,
          type: BookingEventType.RECONCILIATION_MISMATCH,
          metadata: {
            stripePaymentIntentId: booking.stripePaymentIntentId,
            stripeStatus: intent.status,
            dbStatus: booking.paymentStatus,
            expected,
          },
        },
      })
    } catch (error) {
      failed += 1
      await recordJobFailure(booking.id, 'reconcile_payment', error)
    }
  }

  return { checked: bookings.length, mismatches, failed }
}
