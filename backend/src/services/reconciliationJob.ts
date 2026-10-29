import { BookingEventType, PaymentStatus } from '@prisma/client'
import prisma from '../utils/prisma'
import { retrievePaymentIntent } from './paymentService'
import { recordJobFailure } from './cleanupJob'

// Hourly drift check between each in-flight booking's paymentStatus and its
// rental PaymentIntent in Stripe. Only disagreements are written to the
// booking's audit trail: writing a RECONCILIATION_MATCH row for every booking
// every hour grew booking_events without bound and buried real events in the
// admin timeline. Audit-only — it never changes booking state.

/** Recorded (as a RECONCILIATION_MISMATCH event) when Stripe says the
 *  booking's PaymentIntent doesn't exist in this account: a row written by a
 *  test or another environment, or a different Stripe account's id. Such a
 *  booking is checked once, logged once, and skipped from then on; retrying it
 *  every hour only repeated the same resource_missing error. */
export const PAYMENT_INTENT_MISSING = 'payment_intent_missing'

function isResourceMissing(error: unknown) {
  const e = error as { code?: unknown; raw?: { code?: unknown } } | null
  return e?.code === 'resource_missing' || e?.raw?.code === 'resource_missing'
}

export async function reconcileStripePayments() {
  const bookings = await prisma.booking.findMany({
    where: {
      stripePaymentIntentId: { not: null },
      paymentStatus: { in: [PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURE_PENDING, PaymentStatus.CAPTURED, PaymentStatus.FAILED] },
      events: {
        none: { type: BookingEventType.RECONCILIATION_MISMATCH, metadata: { path: ['reason'], equals: PAYMENT_INTENT_MISSING } },
      },
    },
    select: {
      id: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
    },
  })

  if (!process.env.STRIPE_SECRET_KEY) {
    return { checked: bookings.length, mismatches: 0, failed: 0, missing: 0 }
  }

  let mismatches = 0
  let failed = 0
  let missing = 0

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
      if (isResourceMissing(error)) {
        missing += 1
        console.warn(
          `[reconcile_payment] booking ${booking.id}: PaymentIntent ${booking.stripePaymentIntentId} does not exist in this Stripe account; recorded once and skipped from now on.`
        )
        try {
          await prisma.bookingEvent.create({
            data: {
              bookingId: booking.id,
              type: BookingEventType.RECONCILIATION_MISMATCH,
              metadata: {
                reason: PAYMENT_INTENT_MISSING,
                stripePaymentIntentId: booking.stripePaymentIntentId,
                dbStatus: booking.paymentStatus,
              },
            },
          })
        } catch (auditError) {
          // Never let the audit write stop the run; the next run tries again.
          console.error(`[reconcile_payment] could not record the missing PaymentIntent for booking ${booking.id}:`, auditError)
        }
        continue
      }
      failed += 1
      await recordJobFailure(booking.id, 'reconcile_payment', error)
    }
  }

  return { checked: bookings.length, mismatches, failed, missing }
}
