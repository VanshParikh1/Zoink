import { Request, Response } from 'express'
import { BookingEventType, PaymentStatus } from '@prisma/client'
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

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

async function updateBookingFromEvent(event: StripeEvent) {
  const object = event.data.object
  const bookingId = getBookingId(object)
  if (!bookingId) return

  const data: any = {}

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
    // TODO: this doesn't distinguish a partial refund from a full one — it fires on any
    // refund amount and always stamps the booking fully REFUNDED. Harmless today since
    // releaseDuePayouts() excludes RESOLVED_REFUND bookings from auto-payout regardless of
    // amount (see cleanupJob.ts), but will need revisiting if automatic partial-payout
    // logic is ever built (e.g. read object.amount_refunded vs the charge/PI total to tell
    // partial from full).
    data.paymentStatus = PaymentStatus.REFUNDED
    data.refundedAt = new Date()
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
          paymentStatus: data.paymentStatus,
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
