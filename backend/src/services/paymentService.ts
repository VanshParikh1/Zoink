import { Booking, PaymentStatus, Prisma } from '@prisma/client'

const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.15)
const INSURANCE_RATE = Number(process.env.INSURANCE_RATE ?? 0.03)
const MIN_INSURANCE_FEE = Number(process.env.MIN_INSURANCE_FEE ?? 1)
const MAX_INSURANCE_FEE = Number(process.env.MAX_INSURANCE_FEE ?? 50)

type StripeClient = any

let stripeClient: StripeClient | null | undefined

function getStripe(): StripeClient | null {
  if (stripeClient !== undefined) return stripeClient

  if (!process.env.STRIPE_SECRET_KEY) {
    stripeClient = null
    return stripeClient
  }

  const Stripe = require('stripe')
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-04-30.basil',
  })
  return stripeClient
}

export function isStripeConfigured() {
  return Boolean(getStripe())
}

export function toCents(value: Prisma.Decimal | number) {
  return Math.round(Number(value) * 100)
}

export function toDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2))
}

export function calculateInsuranceFee(itemValue: Prisma.Decimal | number, insuranceOptIn: boolean) {
  if (!insuranceOptIn) return 0

  const value = Number(itemValue)
  if (value <= 0) return 0

  return Math.min(MAX_INSURANCE_FEE, Math.max(MIN_INSURANCE_FEE, Math.round(value * INSURANCE_RATE * 100) / 100))
}

export function calculateCommission(totalPrice: Prisma.Decimal | number) {
  return Math.round(Number(totalPrice) * PLATFORM_COMMISSION_RATE * 100) / 100
}

export function calculateOwnerPayout(totalPrice: Prisma.Decimal | number) {
  return Math.round((Number(totalPrice) - calculateCommission(totalPrice)) * 100) / 100
}

export function getAuthorizationAmount(booking: Pick<Booking, 'totalPrice' | 'depositAmount' | 'insuranceFee'>) {
  return toCents(Number(booking.totalPrice) + Number(booking.depositAmount) + Number(booking.insuranceFee))
}

export async function createPaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'totalPrice' | 'depositAmount' | 'insuranceFee'>,
  stripeCustomerId?: string | null
) {
  const stripe = getStripe()
  const amount = getAuthorizationAmount(booking as any)

  if (!stripe) {
    return {
      id: `pi_mock_${booking.id}`,
      client_secret: `pi_mock_secret_${booking.id}`,
      status: 'requires_capture',
      amount,
    }
  }

  return stripe.paymentIntents.create(
    {
      amount,
      currency: process.env.STRIPE_CURRENCY ?? 'usd',
      customer: stripeCustomerId ?? undefined,
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId: booking.id },
    },
    { idempotencyKey: `payment-intent-${booking.id}-${booking.version}` }
  )
}

export async function capturePaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'stripePaymentIntentId' | 'totalPrice' | 'insuranceFee'>,
  amountOverrideCents?: number
) {
  if (!booking.stripePaymentIntentId) {
    throw new Error('PAYMENT_INTENT_MISSING')
  }

  const stripe = getStripe()
  const amount = amountOverrideCents ?? toCents(Number(booking.totalPrice) + Number(booking.insuranceFee))

  if (!stripe) {
    return {
      id: booking.stripePaymentIntentId,
      status: 'succeeded',
      amount_received: amount,
    }
  }

  return stripe.paymentIntents.capture(
    booking.stripePaymentIntentId,
    { amount_to_capture: amount },
    { idempotencyKey: `capture-${booking.id}-${booking.version}` }
  )
}

export async function cancelPaymentIntent(booking: Pick<Booking, 'id' | 'version' | 'stripePaymentIntentId'>) {
  if (!booking.stripePaymentIntentId) {
    throw new Error('PAYMENT_INTENT_MISSING')
  }

  const stripe = getStripe()

  if (!stripe) {
    return {
      id: booking.stripePaymentIntentId,
      status: 'canceled',
    }
  }

  return stripe.paymentIntents.cancel(
    booking.stripePaymentIntentId,
    {},
    { idempotencyKey: `cancel-${booking.id}-${booking.version}` }
  )
}

export async function refundPaymentIntent(booking: Pick<Booking, 'id' | 'version' | 'stripePaymentIntentId'>, partialAmountCents?: number) {
  if (!booking.stripePaymentIntentId) {
    throw new Error('PAYMENT_INTENT_MISSING')
  }

  const stripe = getStripe()

  if (!stripe) {
    return {
      id: `re_mock_${booking.id}`,
      status: 'succeeded',
      payment_intent: booking.stripePaymentIntentId,
      amount: partialAmountCents,
    }
  }

  return stripe.refunds.create(
    {
      payment_intent: booking.stripePaymentIntentId,
      amount: partialAmountCents,
      metadata: { bookingId: booking.id },
    },
    { idempotencyKey: `refund-${booking.id}-${booking.version}` }
  )
}

export async function transferPayout(booking: Pick<Booking, 'id' | 'version' | 'ownerPayout'>, stripeAccountId: string) {
  const stripe = getStripe()
  const amount = toCents(booking.ownerPayout)

  if (!stripe) {
    return {
      id: `tr_mock_${booking.id}`,
      amount,
      destination: stripeAccountId,
    }
  }

  return stripe.transfers.create(
    {
      amount,
      currency: process.env.STRIPE_CURRENCY ?? 'usd',
      destination: stripeAccountId,
      metadata: { bookingId: booking.id },
    },
    { idempotencyKey: `payout-${booking.id}-${booking.version}` }
  )
}

export function getMockAuthorizedPaymentStatus() {
  return isStripeConfigured() ? PaymentStatus.PENDING_AUTH : PaymentStatus.AUTHORIZED
}
