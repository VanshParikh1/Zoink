import { Request, Response } from 'express'
import { BookingEventType, DepositStatus, PaymentStatus } from '@prisma/client'
import prisma from '../../utils/prisma'
import { asyncHandler } from '../../utils/asyncHandler'
import { BadRequestError, InternalServerError } from '../../utils/errors'

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

  if (isDeposit) {
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
    if (event.type === 'payment_intent.amount_capturable_updated') {
      data.paymentStatus = PaymentStatus.AUTHORIZED
    }

    if (event.type === 'payment_intent.succeeded') {
      data.paymentStatus = PaymentStatus.CAPTURED
      data.paidAt = new Date()
      data.stripeChargeId = object.latest_charge ?? null
    }

    if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
      data.paymentStatus = event.type === 'payment_intent.canceled' ? PaymentStatus.REFUNDED : PaymentStatus.FAILED
      if (event.type === 'payment_intent.canceled') data.refundedAt = new Date()
    }

    if (event.type === 'charge.refunded' || event.type === 'refund.succeeded') {
      // Tell a partial refund from a full one instead of always stamping REFUNDED.
      //  - charge.refunded carries the cumulative amount_refunded and the charge
      //    total, so it's authoritative — assign from it.
      //  - refund.succeeded is a single Refund object with no cumulative/total, so
      //    take it as a lower bound (max with what we already recorded).
      const cumulativeRefundedCents =
        event.type === 'charge.refunded'
          ? Number(object.amount_refunded ?? object.amount ?? 0)
          : Math.max(booking.refundedAmountCents, Number(object.amount ?? 0))

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

  await prisma.$transaction(async (tx) => {
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
  })
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
    console.error('Stripe webhook handling failed:', error)
    throw new InternalServerError('Webhook handling failed.')
  }
})
