import { randomUUID } from 'crypto'
import { Request, Response } from 'express'
import { BookingEventType, BookingStatus, DepositStatus, PaymentStatus } from '@prisma/client'
import prisma from '../../utils/prisma'
import { asyncHandler } from '../../utils/asyncHandler'
import { BadRequestError, InternalServerError } from '../../utils/errors'
import { Sentry } from '../../instrument'
import { loggableError } from '../../utils/sentryScrub'

type StripeEvent = {
  id: string
  type: string
  data: { object: any }
}

function getBookingId(object: any) {
  return object?.metadata?.bookingId ?? object?.payment_intent?.metadata?.bookingId ?? null
}

/** The PaymentIntent id an event concerns. For payment_intent.* events that's
 *  object.id; for charge.* / refund.* events it's object.payment_intent (a
 *  string, or an expanded object). */
function getEventPaymentIntentId(object: any): string | null {
  if (object?.object === 'payment_intent') return object.id ?? null
  const pi = object?.payment_intent
  if (!pi) return null
  return typeof pi === 'string' ? pi : (pi.id ?? null)
}

/** A booking now has two PaymentIntents: the rental payment
 *  (booking.stripePaymentIntentId) and a separate deposit hold
 *  (booking.stripeDepositPaymentIntentId, created by
 *  paymentService.createDepositPaymentIntent with metadata.purpose === 'deposit').
 *  Their webhook events must not be conflated — a deposit capture/cancel must
 *  never rewrite the rental's paymentStatus/paidAt/stripeChargeId/refundedAt. */
function isDepositEvent(
  object: any,
  booking: { stripePaymentIntentId: string | null; stripeDepositPaymentIntentId: string | null }
): boolean {
  const purpose = object?.metadata?.purpose ?? object?.payment_intent?.metadata?.purpose
  if (purpose === 'deposit') return true

  const eventPiId = getEventPaymentIntentId(object)
  if (
    eventPiId &&
    booking.stripeDepositPaymentIntentId &&
    eventPiId === booking.stripeDepositPaymentIntentId &&
    eventPiId !== booking.stripePaymentIntentId
  ) {
    return true
  }
  return false
}

// Stripe doesn't deliver events in order, so each rental event may only move
// paymentStatus forward from the states listed here. Before this, a late
// amount_capturable_updated could walk a CAPTURED booking back to AUTHORIZED,
// a late payment_failed could mark an authorized booking FAILED, and a late
// payment_intent.succeeded after the return could reset PAYOUT_PENDING to
// CAPTURED, which releaseDuePayouts never picks up (the owner went unpaid).
const AUTHORIZABLE_FROM: PaymentStatus[] = [PaymentStatus.PENDING_AUTH, PaymentStatus.FAILED]
const CAPTURABLE_FROM: PaymentStatus[] = [
  PaymentStatus.PENDING_AUTH,
  PaymentStatus.FAILED,
  PaymentStatus.AUTHORIZED,
  PaymentStatus.CAPTURE_PENDING,
]
const FAILABLE_FROM: PaymentStatus[] = [PaymentStatus.PENDING_AUTH]
const CANCELABLE_FROM: PaymentStatus[] = [
  PaymentStatus.PENDING_AUTH,
  PaymentStatus.FAILED,
  PaymentStatus.AUTHORIZED,
  PaymentStatus.CAPTURE_PENDING,
  PaymentStatus.REFUND_PENDING,
]

function constructEvent(req: Request): StripeEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const signature = req.headers['stripe-signature']

  if (secret && signature) {
    const Stripe = require('stripe')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-04-30.basil',
    })
    return stripe.webhooks.constructEvent(req.body, signature, secret)
  }

  // Fail closed. A genuine Stripe delivery always carries a `stripe-signature`
  // header that must verify against STRIPE_WEBHOOK_SECRET. If the secret is not
  // configured, or the header is absent, the request body is entirely
  // caller-controlled and must NOT be trusted — reject it instead of falling
  // back to parsing it as an authentic event.
  //
  // The only exception is the integration test suite (NODE_ENV === 'test'),
  // which posts synthetic unsigned events on purpose when it runs without a
  // STRIPE_WEBHOOK_SECRET configured. This branch is unreachable in any
  // non-test environment and is also closed whenever a secret is present.
  if (process.env.NODE_ENV !== 'test' || secret) {
    throw new BadRequestError('Stripe webhook signature verification failed.')
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

async function updateBookingFromEvent(event: StripeEvent) {
  const object = event.data.object
  const bookingId = getBookingId(object)
  if (!bookingId) return

  // Load the booking up front so payment_intent.* events can be routed by which
  // PaymentIntent they actually belong to (rental vs. deposit). A missing
  // booking is a no-op (a real Stripe event for a booking we don't have is a
  // prod bug, but the webhook must still 200 so Stripe stops retrying).
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      paidAt: true,
      stripePaymentIntentId: true,
      stripeDepositPaymentIntentId: true,
      depositStatus: true,
      totalPrice: true,
      insuranceFee: true,
      hstAmount: true,
      refundedAmountCents: true,
    },
  })
  if (!booking) return

  // The renter's full rental charge (rental + insurance + HST), in cents — what
  // a "full" refund would total. Used to tell a partial refund from a full one.
  const fullChargeCents = Math.round(
    (Number(booking.totalPrice) + Number(booking.insuranceFee) + Number(booking.hstAmount)) * 100
  )

  const isDeposit = isDepositEvent(object, booking)
  const data: any = {}

  // A new rental PaymentIntent is minted on every Pay attempt and overwrites
  // booking.stripePaymentIntentId, but events for the PREVIOUS PaymentIntent
  // keep arriving — notably Stripe's automatic payment_intent.canceled once an
  // abandoned authorization expires. Those describe money that is no longer
  // this booking's rental payment, so they are recorded for audit only and
  // never mutate the booking (a stale cancel used to stamp a paid booking
  // REFUNDED, which then silently suppressed the owner's payout).
  const eventPaymentIntentId = getEventPaymentIntentId(object)
  const isSuperseded =
    !isDeposit &&
    eventPaymentIntentId !== null &&
    booking.stripePaymentIntentId !== null &&
    eventPaymentIntentId !== booking.stripePaymentIntentId

  if (isSuperseded) {
    // No booking field to update — the WEBHOOK_RECEIVED audit row below still records it.
  } else if (isDeposit) {
    // Deposit-PI lifecycle events only ever move depositStatus — never the
    // rental payment fields. depositStatus is normally set synchronously
    // (bookingService.transitionBookingStatus / disputeService.resolveDispute /
    // cleanupJob.releaseDueDeposits); these writes are an idempotent,
    // forward-only backstop so a redelivered/stale event can't walk a terminal
    // CAPTURED/RELEASED back to AUTHORIZED.
    const canAdvance = booking.depositStatus == null || booking.depositStatus === DepositStatus.AUTHORIZED

    if (event.type === 'payment_intent.amount_capturable_updated' && canAdvance) {
      data.depositStatus = DepositStatus.AUTHORIZED
    }

    if (event.type === 'payment_intent.succeeded' && canAdvance) {
      data.depositStatus = DepositStatus.CAPTURED
    }

    if (event.type === 'payment_intent.canceled' && canAdvance) {
      data.depositStatus = DepositStatus.RELEASED
    }
    // payment_intent.payment_failed / charge.* for the deposit have no booking
    // field to update here — the WEBHOOK_RECEIVED audit row below still records them.
  } else {
    const current = booking.paymentStatus

    if (event.type === 'payment_intent.amount_capturable_updated' && AUTHORIZABLE_FROM.includes(current)) {
      data.paymentStatus = PaymentStatus.AUTHORIZED
    }

    if (event.type === 'payment_intent.succeeded') {
      if (CAPTURABLE_FROM.includes(current)) {
        // Captured after the return already completed the booking (a delayed
        // webhook): it's owed a payout now, exactly as if the capture had
        // landed first and the return moved CAPTURED to PAYOUT_PENDING.
        data.paymentStatus = booking.status === BookingStatus.COMPLETED ? PaymentStatus.PAYOUT_PENDING : PaymentStatus.CAPTURED
      }
      if (!booking.paidAt) {
        data.paidAt = new Date()
        data.stripeChargeId = object.latest_charge ?? null
      }
    }

    if (event.type === 'payment_intent.payment_failed' && FAILABLE_FROM.includes(current)) {
      data.paymentStatus = PaymentStatus.FAILED
    }

    if (event.type === 'payment_intent.canceled' && CANCELABLE_FROM.includes(current)) {
      data.paymentStatus = PaymentStatus.REFUNDED
      data.refundedAt = new Date()
    }

    if (event.type === 'charge.refunded' || event.type === 'refund.succeeded') {
      // Tell a partial refund from a full one instead of always stamping REFUNDED.
      //  - charge.refunded carries the cumulative amount_refunded and the charge
      //    total.
      //  - refund.succeeded is a single Refund object with no cumulative/total.
      // Either way, max() against what we already recorded: Stripe does not
      // guarantee webhook ordering, so a later-arriving-but-chronologically-
      // earlier delivery carries a *smaller* cumulative and must not walk
      // refundedAmountCents backwards.
      const reportedRefundedCents =
        event.type === 'charge.refunded'
          ? Number(object.amount_refunded ?? object.amount ?? 0)
          : Number(object.amount ?? 0)
      const cumulativeRefundedCents = Math.max(booking.refundedAmountCents, reportedRefundedCents)

      data.refundedAmountCents = cumulativeRefundedCents
      data.refundedAt = new Date()

      const isFullRefund =
        object.refunded === true ||
        (fullChargeCents > 0 && cumulativeRefundedCents >= fullChargeCents)

      if (isFullRefund) {
        data.paymentStatus = PaymentStatus.REFUNDED
      }
      // Partial refund: leave paymentStatus (CAPTURED / PAYOUT_PENDING) alone so
      // the booking isn't overstated as fully refunded and releaseDuePayouts()
      // can still release the owner's proportional remaining payout.
    }
  }

  const duplicate = await prisma.$transaction(async (tx) => {
    // Idempotency guard. Stripe documents that a webhook can be delivered more
    // than once (automatic retries, `stripe events resend`), and a validly-
    // signed body can be replayed by a caller. Claim event.id FIRST, in the
    // same transaction as the booking mutation + audit write, so two near-
    // simultaneous redeliveries can't both pass a check before either commits —
    // the unique index on stripeEventId serializes them and exactly one wins.
    // ON CONFLICT DO NOTHING + affected-row count is how we detect the loser
    // (Prisma's create() would throw P2002, which is harder to distinguish
    // from an unrelated failure inside an interactive transaction).
    const inserted = await tx.$executeRaw`
      INSERT INTO "processed_stripe_events" ("id", "stripeEventId", "eventType")
      VALUES (${randomUUID()}, ${event.id}, ${event.type})
      ON CONFLICT ("stripeEventId") DO NOTHING
    `
    if (inserted === 0) {
      // Already processed — skip the booking mutation and the audit write
      // entirely. The caller still returns { received: true } / HTTP 200 so
      // Stripe stops retrying. This is independent of the state-machine
      // monotonicity guards above (e.g. depositStatus canAdvance).
      return true
    }

    if (Object.keys(data).length > 0) {
      await tx.booking.update({
        where: { id: bookingId },
        data: { ...data, version: { increment: 1 } },
      })
    }

    await tx.bookingEvent.create({
      data: {
        bookingId,
        type: BookingEventType.WEBHOOK_RECEIVED,
        metadata: {
          stripeEventId: event.id,
          type: event.type,
          scope: isDeposit ? 'deposit' : 'rental',
          ...(isSuperseded
            ? {
                superseded: true,
                eventPaymentIntentId,
                currentPaymentIntentId: booking.stripePaymentIntentId,
              }
            : {}),
          paymentStatus: data.paymentStatus,
          depositStatus: data.depositStatus,
          refundedAmountCents: data.refundedAmountCents,
          partialRefund:
            data.refundedAmountCents != null &&
            data.refundedAmountCents > 0 &&
            data.paymentStatus !== PaymentStatus.REFUNDED
              ? true
              : undefined,
        },
      },
    })

    return false
  })

  if (duplicate) {
    console.warn(
      `Stripe webhook ${event.id} (${event.type}) already processed — skipping duplicate delivery`
    )
  }
}

export const stripeWebhook = asyncHandler(async (req: Request, res: Response) => {
  let event: StripeEvent

  try {
    event = constructEvent(req)
  } catch (error) {
    throw new BadRequestError('Invalid Stripe webhook signature.')
  }

  try {
    await updateBookingFromEvent(event)
    return res.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook handling failed:', loggableError(error))
    // errorHandler only sees the generic InternalServerError below, so capture
    // the real cause here while we still have it.
    Sentry.captureException(error, {
      tags: { 'stripe.event_type': event.type, 'stripe.event_id': event.id },
    })
    throw new InternalServerError('Webhook handling failed.')
  }
})
