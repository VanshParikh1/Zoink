import { Booking, PaymentStatus, Prisma } from '@prisma/client'
import { InternalServerError, ConflictError } from '../utils/errors'
import prisma from '../utils/prisma'


const PLATFORM_COMMISSION_RATE = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.15)
const INSURANCE_RATE = Number(process.env.INSURANCE_RATE ?? 0.03)
const MIN_INSURANCE_FEE = Number(process.env.MIN_INSURANCE_FEE ?? 1)
const MAX_INSURANCE_FEE = Number(process.env.MAX_INSURANCE_FEE ?? 50)

type StripeClient = any

let stripeClient: StripeClient | null | undefined

function getStripeConnectRedirectUrl(kind: 'return' | 'refresh') {
  const envVar = kind === 'return' ? 'STRIPE_CONNECT_RETURN_URL' : 'STRIPE_CONNECT_REFRESH_URL'
  const url = process.env[envVar]

  if (!url) {
    throw new InternalServerError(`${envVar} is not configured.`)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new InternalServerError(`${envVar} must be a valid http://localhost or https:// URL.`)
  }

  // Stripe's account-link API only accepts http(s) return/refresh URLs, not custom
  // schemes like zoink:// — the deep link back into the app happens one hop later,
  // via the HTML page these URLs serve (see /stripe-return and /stripe-refresh in index.ts).
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')) {
    throw new InternalServerError(`${envVar} must be a valid http://localhost or https:// URL.`)
  }

  return url
}

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

// Rental + insurance only — the deposit is authorized separately (see
// createDepositPaymentIntent) so it can stay held through the full rental
// and be resolved at return handoff instead of being released at pickup
// as a side effect of this PaymentIntent's partial capture.
export function getRentalAuthorizationAmount(booking: Pick<Booking, 'totalPrice' | 'insuranceFee'>) {
  return toCents(Number(booking.totalPrice) + Number(booking.insuranceFee))
}

export async function createPaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'totalPrice' | 'depositAmount' | 'insuranceFee'>,
  stripeCustomerId?: string | null
) {
  const stripe = getStripe()
  const amount = getRentalAuthorizationAmount(booking as any)

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
      currency: process.env.STRIPE_CURRENCY ?? 'cad',
      customer: stripeCustomerId ?? undefined,
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      // The deposit PaymentIntent (created once this one is confirmed — see
      // createDepositPaymentIntent) reuses the payment method attached here,
      // off-session, so it needs to be saved for later reuse against the
      // same customer.
      setup_future_usage: stripeCustomerId ? 'off_session' : undefined,
      metadata: { bookingId: booking.id },
    },
    { idempotencyKey: `payment-intent-${booking.id}-${booking.version}` }
  )
}

/** Creates and immediately confirms a manual-capture PaymentIntent for the
 *  deposit, off-session, against the payment method the borrower already
 *  attached while confirming the rental PaymentIntent. Called once the
 *  rental PaymentIntent has actually been confirmed (see
 *  bookingService.transitionBookingStatus's CONFIRMED branch) — a payment
 *  method only becomes reusable off-session after that confirmation. */
export async function createDepositPaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'depositAmount'>,
  stripeCustomerId: string,
  paymentMethodId: string
) {
  const stripe = getStripe()
  const amount = toCents(booking.depositAmount)

  if (!stripe) {
    return {
      id: `pi_mock_deposit_${booking.id}`,
      status: 'requires_capture',
      amount,
    }
  }

  return stripe.paymentIntents.create(
    {
      amount,
      currency: process.env.STRIPE_CURRENCY ?? 'cad',
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      capture_method: 'manual',
      off_session: true,
      confirm: true,
      metadata: { bookingId: booking.id, purpose: 'deposit' },
    },
    { idempotencyKey: `deposit-payment-intent-${booking.id}-${booking.version}` }
  )
}

/** Reads back the payment method attached to a confirmed PaymentIntent, so
 *  it can be reused off-session for the deposit PaymentIntent. */
export async function getPaymentIntentPaymentMethod(paymentIntentId: string): Promise<string | null> {
  const stripe = getStripe()
  if (!stripe) {
    return `pm_mock_${paymentIntentId}`
  }

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (!intent.payment_method) return null
  return typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method.id
}

/** Returns the user's Stripe Customer id, creating one if they don't have
 *  one yet. A real Customer is required so the rental PaymentIntent's
 *  payment method can be saved (setup_future_usage) and reused off-session
 *  for the deposit PaymentIntent. */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
  existingCustomerId?: string | null
): Promise<string | null> {
  if (existingCustomerId) return existingCustomerId

  const stripe = getStripe()
  if (!stripe) {
    return `cus_mock_${userId}`
  }

  const customer = await stripe.customers.create({ email, metadata: { userId } })

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

export async function capturePaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'stripePaymentIntentId' | 'totalPrice' | 'insuranceFee'>,
  amountOverrideCents?: number
) {
  if (!booking.stripePaymentIntentId) {
    throw new ConflictError('Payment authorization is missing.')
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
    throw new ConflictError('Payment authorization is missing.')
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

export async function refundPaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'stripePaymentIntentId'>,
  partialAmountCents?: number,
  idempotencySalt?: string,
  db: typeof prisma = prisma
) {
  if (!booking.stripePaymentIntentId) {
    throw new ConflictError('Payment authorization is missing.')
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
    // A booking can now legitimately be refunded more than once (sequential disputes,
    // each a different amount — see disputeService.ts's remaining-balance check). Keying
    // idempotency on booking.version alone breaks that: nothing bumps the booking's
    // version between two dispute resolutions, so a second, different-amount refund
    // would reuse the exact same key and Stripe rejects it as a conflicting retry.
    // idempotencySalt (the dispute id, from the only caller) is unique per refund
    // attempt since a dispute can only ever be resolved once, while still being stable
    // across an actual retry of that same request.
    { idempotencyKey: `refund-${booking.id}-${idempotencySalt ?? booking.version}` }
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
      currency: process.env.STRIPE_CURRENCY ?? 'cad',
      destination: stripeAccountId,
      metadata: { bookingId: booking.id },
    },
    { idempotencyKey: `payout-${booking.id}-${booking.version}` }
  )
}

export async function createConnectAccountLink(accountId?: string | null) {
  const stripe = getStripe()
  if (!stripe) {
    return { url: 'https://demo-stripe-onboarding.zoink.com' }
  }

  let account = accountId
  if (!account) {
    const acc = await stripe.accounts.create({ type: 'express' })
    account = acc.id
  }

  const link = await stripe.accountLinks.create({
    account: account,
    refresh_url: getStripeConnectRedirectUrl('refresh'),
    return_url: getStripeConnectRedirectUrl('return'),
    type: 'account_onboarding',
  })

  return { accountId: account, url: link.url }
}

export async function getConnectAccountStatus(accountId: string) {
  const stripe = getStripe()
  if (!stripe) {
    return { connected: true, chargesEnabled: true, detailsSubmitted: true, payoutsEnabled: true }
  }

  const account = await stripe.accounts.retrieve(accountId)
  return {
    connected: true,
    chargesEnabled: account.charges_enabled,
    detailsSubmitted: account.details_submitted,
    payoutsEnabled: account.payouts_enabled,
  }
}

export function getMockAuthorizedPaymentStatus() {
  return isStripeConfigured() ? PaymentStatus.PENDING_AUTH : PaymentStatus.AUTHORIZED
}
