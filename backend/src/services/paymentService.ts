import { Booking, PaymentStatus, Prisma } from '@prisma/client'
import {
  calculateCommission as sharedCalculateCommission,
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
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, STRIPE_CLIENT_OPTIONS)
  return stripeClient
}

// Stripe calls run inside DB transactions capped at 30 s (bookingService
// STRIPE_TX_OPTIONS, cleanupJob STRIPE_JOB_TX_OPTIONS). The SDK's default 80 s
// timeout let a call succeed after its transaction had already given up. The
// per-attempt timeout is sized so all three attempts plus the SDK's backoff
// (0.5-2 s between tries) stay under 30 s: 3 x 8 s + ~3 s. A retry re-sends
// the same headers, so it reuses the idempotency key we pass.
export const STRIPE_CLIENT_OPTIONS = {
  apiVersion: '2025-04-30.basil',
  timeout: 8_000,
  maxNetworkRetries: 2,
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

// The commission (flat 15%, $2 minimum) lives in @zoink/shared (commission.ts)
// so the app's payout preview can't drift from what's charged. These wrappers
// take the Prisma.Decimal | number amounts callers already have.
export function calculateCommission(totalPrice: Prisma.Decimal | number) {
  return sharedCalculateCommission(Number(totalPrice))
}

export function calculateOwnerPayout(totalPrice: Prisma.Decimal | number) {
  return sharedCalculateOwnerPayout(Number(totalPrice))
}

// Rental + insurance + HST (0 since D-2; older bookings may hold HST) — the deposit is authorized separately (see
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

/** When an uncaptured hold stops being capturable: Stripe's capture_before on
 *  its charge, or 7 days after the hold was created if Stripe doesn't say.
 *  Null without Stripe (mock mode). */
export async function getAuthorizationExpiry(paymentIntentId: string): Promise<Date | null> {
  const stripe = getStripe()
  if (!stripe) return null
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
  const captureBefore = intent?.latest_charge?.payment_method_details?.card?.capture_before
  if (captureBefore) return new Date(captureBefore * 1000)
  return intent?.created ? new Date((intent.created + 7 * 24 * 60 * 60) * 1000) : null
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
      latest_charge: `ch_mock_${booking.stripePaymentIntentId}`,
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

  // An authorization that is already released (Stripe expired it, or an
  // earlier attempt went through) counts as released.
  try {
    return await stripe.paymentIntents.cancel(
      booking.stripePaymentIntentId,
      {},
      { idempotencyKey: `cancel-${booking.id}-${booking.version}` }
    )
  } catch (error) {
    const current = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId).catch(() => null)
    if (current?.status === 'canceled') return current
    throw error
  }
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
 *  the key is the PaymentIntent itself. The result's latest_charge is the
 *  charge the owner's compensation transfer is drawn from. */
export async function captureDepositPaymentIntent(
  booking: { id: string; stripeDepositPaymentIntentId: string },
  amountCents: number
) {
  const stripe = getStripe()
  if (!stripe) {
    return {
      id: booking.stripeDepositPaymentIntentId,
      status: 'succeeded',
      amount_received: amountCents,
      latest_charge: `ch_mock_${booking.stripeDepositPaymentIntentId}`,
    }
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

/** The charge a PaymentIntent created (its latest_charge), or null if it has
 *  none yet. In mock mode, a stand-in id. */
export async function getPaymentIntentChargeId(paymentIntentId: string): Promise<string | null> {
  const stripe = getStripe()
  if (!stripe) return `ch_mock_${paymentIntentId}`
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  return chargeIdOf(intent)
}

/** A Stripe refusal that the same request will keep getting (a restricted or
 *  missing account, an invalid parameter), as opposed to a network, server,
 *  rate-limit or balance problem that a later attempt can get past. */
export function isPermanentStripeError(error: unknown): boolean {
  const e = error as { type?: unknown; statusCode?: unknown; code?: unknown } | null
  if (!e) return false
  if (e.code === 'balance_insufficient' || e.type === 'StripeIdempotencyError') return false
  return e.type === 'StripeInvalidRequestError' || e.type === 'StripePermissionError' || e.statusCode === 400 || e.statusCode === 403 || e.statusCode === 404
}

/** latest_charge as an id, whether Stripe returned it expanded or not. */
export function chargeIdOf(intent: { latest_charge?: string | { id: string } | null } | null | undefined): string | null {
  const charge = intent?.latest_charge
  if (!charge) return null
  return typeof charge === 'string' ? charge : charge.id
}

// Transfers name the renter's charge as source_transaction, so they succeed
// while that charge's funds are still pending (they land in the owner's
// balance when the charge settles) instead of failing on the platform's
// available balance.
export async function transferPayout(
  booking: Pick<Booking, 'id' | 'ownerPayout'>,
  stripeAccountId: string,
  amountCentsOverride?: number,
  sourceChargeId?: string | null
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
      ...(sourceChargeId ? { source_transaction: sourceChargeId } : {}),
      metadata: { bookingId: booking.id },
    },
    // One payout per booking, so the key is the booking alone. It used to
    // include the version, which the deposit-release job bumps: a transfer
    // Stripe accepted but whose DB write failed was then sent again under a
    // new key. Stripe keeps keys for 24 h and this job retries every 15 min.
    { idempotencyKey: `payout-${booking.id}` }
  )
}

/** Transfers a captured deposit amount to the owner, in full — no commission
 *  cut, unlike the rental payout above: the deposit was captured to
 *  compensate the owner, so none of it belongs to the platform. A deposit is
 *  captured once, so the key is the booking alone (P1-1): it never depends on
 *  a row a retried close-out or resolution creates again. */
export async function transferDepositCompensation(
  booking: Pick<Booking, 'id'>,
  stripeAccountId: string,
  amountCents: number,
  sourceChargeId: string | null
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
      ...(sourceChargeId ? { source_transaction: sourceChargeId } : {}),
      metadata: { bookingId: booking.id, purpose: 'deposit_compensation' },
    },
    { idempotencyKey: `deposit-comp-${booking.id}` }
  )
}

/** A deposit compensation already sent to this owner for this booking, found
 *  by its metadata. Covers a transfer Stripe accepted but whose DB write was
 *  lost after its idempotency key expired (24 h). Null in mock mode. */
export async function findDepositCompensationTransfer(bookingId: string, stripeAccountId: string, since: Date) {
  const stripe = getStripe()
  if (!stripe) return null
  for await (const transfer of stripe.transfers.list({ destination: stripeAccountId, created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100 })) {
    if (transfer.metadata?.bookingId === bookingId && transfer.metadata?.purpose === 'deposit_compensation') return transfer as { id: string }
  }
  return null
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
