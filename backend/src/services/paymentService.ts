import { Booking, PaymentStatus, Prisma } from '@prisma/client'
import {
  calculateCommission as sharedCalculateCommission,
  calculateHst as sharedCalculateHst,
  calculateOwnerPayout as sharedCalculateOwnerPayout,
} from '@zoink/shared'
import { InternalServerError, ConflictError } from '../utils/errors'
import prisma from '../utils/prisma'


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

// Ontario HST (13%, @zoink/shared HST_RATE) on the rental price only — not the
// deposit (a hold, not a sale) and not insurance. Charged on top of what the
// borrower pays; never subtracted from totalPrice before commission/ownerPayout
// are computed, so it has no effect on the owner's earnings. The platform has
// no per-listing jurisdiction field today, so this applies to every booking.
export function calculateHst(rentalTotalPrice: Prisma.Decimal | number) {
  return sharedCalculateHst(Number(rentalTotalPrice))
}

// The commission (flat 15%, $2 minimum) lives in @zoink/shared (commission.ts)
// so the app's payout preview can't drift from what's charged. These wrappers
// take the Prisma.Decimal | number amounts callers already have.
export function calculateCommission(totalPrice: Prisma.Decimal | number) {
  return sharedCalculateCommission(Number(totalPrice))
}

export function calculateOwnerPayout(totalPrice: Prisma.Decimal | number) {
  return sharedCalculateOwnerPayout(Number(totalPrice))
}

// Rental + insurance + HST — the deposit is authorized separately (see
// createDepositPaymentIntent) so it can stay held through the full rental
// and be resolved at return handoff instead of being released at pickup
// as a side effect of this PaymentIntent's partial capture. HST is folded
// in here (not tracked as its own PaymentIntent) since it settles on
// exactly the same schedule as the rental price — captured together at
// pickup, same as insurance.
export function getRentalAuthorizationAmount(booking: Pick<Booking, 'totalPrice' | 'insuranceFee' | 'hstAmount'>) {
  return toCents(Number(booking.totalPrice) + Number(booking.insuranceFee) + Number(booking.hstAmount))
}

export async function createPaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'totalPrice' | 'depositAmount' | 'insuranceFee' | 'hstAmount'>,
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

/** Reads a PaymentIntent back from Stripe. Returns null in mock mode (no
 *  STRIPE_SECRET_KEY), where there is no real PaymentIntent to inspect. */
export async function retrievePaymentIntent(paymentIntentId: string) {
  const stripe = getStripe()
  if (!stripe) return null
  return stripe.paymentIntents.retrieve(paymentIntentId)
}

/** Creates and immediately confirms a manual-capture PaymentIntent for the
 *  deposit, off-session, against the payment method the borrower already
 *  attached while confirming the rental PaymentIntent. Called once the
 *  rental PaymentIntent has actually been confirmed (see
 *  bookingService.transitionBookingStatus's CONFIRMED branch) — a payment
 *  method only becomes reusable off-session after that confirmation. */
export async function createDepositPaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'depositAmount' | 'stripePaymentIntentId'>,
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
    // One deposit hold per rental authorization. This used to be keyed on the
    // booking version, which webhooks bump: a confirm retried after a 409 (or
    // a double tap racing the deposit's own amount_capturable_updated webhook)
    // got a fresh key and put a second deposit hold on the renter's card.
    { idempotencyKey: `deposit-payment-intent-${booking.id}-${booking.stripePaymentIntentId}` }
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

  // Keyed per user so a double-tapped Pay (or a retried request) can't create
  // a second Customer for the same person within Stripe's 24h key window.
  const customer = await stripe.customers.create(
    { email, metadata: { userId } },
    { idempotencyKey: `customer-${userId}` }
  )

  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  })

  return customer.id
}

export async function capturePaymentIntent(
  booking: Pick<Booking, 'id' | 'version' | 'stripePaymentIntentId' | 'totalPrice' | 'insuranceFee' | 'hstAmount'>,
  amountOverrideCents?: number
) {
  if (!booking.stripePaymentIntentId) {
    throw new ConflictError('Payment authorization is missing.')
  }

  const stripe = getStripe()
  const amount = amountOverrideCents ?? toCents(Number(booking.totalPrice) + Number(booking.insuranceFee) + Number(booking.hstAmount ?? 0))

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

/** Releases a booking's deposit hold. Keyed on the deposit PaymentIntent (it
 *  can only ever be released once), never on the booking version, so it can't
 *  collide with the rental PaymentIntent's own cancel key. A hold that is
 *  already released (a retry after a crash, or Stripe expiring it) counts as
 *  released rather than failing forever. */
export async function cancelDepositPaymentIntent(booking: { id: string; stripeDepositPaymentIntentId: string }) {
  const stripe = getStripe()
  if (!stripe) {
    return { id: booking.stripeDepositPaymentIntentId, status: 'canceled' }
  }

  try {
    return await stripe.paymentIntents.cancel(
      booking.stripeDepositPaymentIntentId,
      {},
      { idempotencyKey: `cancel-deposit-${booking.id}-${booking.stripeDepositPaymentIntentId}` }
    )
  } catch (error) {
    const current = await stripe.paymentIntents.retrieve(booking.stripeDepositPaymentIntentId).catch(() => null)
    if (current?.status === 'canceled') return current
    throw error
  }
}

/** Captures `amountCents` of a booking's deposit hold (a dispute resolved
 *  against the renter). A deposit PaymentIntent is captured at most once, so
 *  the key is the PaymentIntent itself. */
export async function captureDepositPaymentIntent(
  booking: { id: string; stripeDepositPaymentIntentId: string },
  amountCents: number
) {
  const stripe = getStripe()
  if (!stripe) {
    return { id: booking.stripeDepositPaymentIntentId, status: 'succeeded', amount_received: amountCents }
  }

  return stripe.paymentIntents.capture(
    booking.stripeDepositPaymentIntentId,
    { amount_to_capture: amountCents },
    { idempotencyKey: `capture-deposit-${booking.id}-${booking.stripeDepositPaymentIntentId}` }
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

export async function transferPayout(
  booking: Pick<Booking, 'id' | 'version' | 'ownerPayout'>,
  stripeAccountId: string,
  amountCentsOverride?: number
) {
  const stripe = getStripe()
  // releaseDuePayouts() passes an explicit amount when a partial dispute refund
  // means the owner is owed less than their originally-snapshotted ownerPayout.
  const amount = amountCentsOverride ?? toCents(booking.ownerPayout)

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

/** Transfers a captured deposit amount to the owner, in full — no commission
 *  cut, unlike the rental payout above. Used when a dispute is resolved as
 *  valid damage against the borrower (disputeService.resolveDispute's
 *  COMPLETED branch): the deposit was captured from the renter specifically
 *  to compensate the owner, so none of it belongs to the platform. Tracked
 *  with its own idempotency key (keyed on the dispute, which can only ever
 *  be resolved once) rather than reusing transferPayout's, since a booking's
 *  rental payout and its deposit compensation are two independent transfers
 *  that can happen at different times for the same booking/version. */
export async function transferDepositCompensation(
  booking: Pick<Booking, 'id'>,
  stripeAccountId: string,
  amountCents: number,
  disputeId: string
) {
  const stripe = getStripe()

  if (!stripe) {
    return {
      id: `tr_mock_deposit_${booking.id}`,
      amount: amountCents,
      destination: stripeAccountId,
    }
  }

  return stripe.transfers.create(
    {
      amount: amountCents,
      currency: process.env.STRIPE_CURRENCY ?? 'cad',
      destination: stripeAccountId,
      metadata: { bookingId: booking.id, disputeId, purpose: 'deposit_compensation' },
    },
    { idempotencyKey: `deposit-payout-${booking.id}-${disputeId}` }
  )
}

export async function createConnectAccountLink(accountId: string | null | undefined, userId: string) {
  const stripe = getStripe()
  if (!stripe) {
    return { url: 'https://demo-stripe-onboarding.zoink.com' }
  }

  let account = accountId
  if (!account) {
    // Keyed per user: a double-tapped "Set up payouts" returns the same Express
    // account instead of creating a second one whose id overwrites the first.
    const acc = await stripe.accounts.create({ type: 'express' }, { idempotencyKey: `connect-account-${userId}` })
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
