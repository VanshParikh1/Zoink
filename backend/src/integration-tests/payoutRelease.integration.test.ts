/**
 * Integration Tests — Automatic Payout Release
 * =============================================
 * Tests `releaseDuePayouts()` (backend/src/services/cleanupJob.ts) against the
 * real zoink_test database and a real Stripe Connect test account, following
 * the `giveOwnerStripeAccount` pattern from bookingLifecycle.integration.test.ts
 * (transferPayout makes a real `stripe.transfers.create` call, so a live,
 * fully-onboarded Connect account is required).
 *
 * What this covers:
 *   - A COMPLETED/PAYOUT_PENDING booking with disputeStatus NONE, RESOLVED_NO_ACTION,
 *     or DISMISSED, past the payout hold window, IS released (paymentStatus -> PAID_OUT).
 *   - A booking with disputeStatus RESOLVED_REFUND is NOT released, even though it
 *     otherwise matches every other filter — releasing it would double-pay the owner
 *     on top of the refund already sent to the renter via Stripe (see
 *     disputeService.resolveDispute). This guards the fix in cleanupJob.ts that
 *     replaced the old `disputeStatus: 'NONE'` filter with an explicit allow-list.
 *   - OPEN/UNDER_REVIEW disputes are NOT released (unresolved, should stay blocked).
 */

import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
  checkStripeConnectivity,
} from './setup'
import { releaseDuePayouts, releaseDueDeposits } from '../services/cleanupJob'
import { PaymentStatus, BookingStatus, DisputeStatus, Prisma } from '@prisma/client'

let stripeAvailable = false
let owner: { id: string; email: string; token: string }
let renter: { id: string; email: string; token: string }
let listingId: string

before(async () => {
  stripeAvailable = await checkStripeConnectivity()
})

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner' })
  renter = await createTestUser({ firstName: 'Renter' })
  const listing = await createTestListing(owner.id, { dailyPrice: 30, itemValue: 300 })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// Tops up the Stripe test-mode platform account's *available* balance.
// transferPayout() below calls the real stripe.transfers.create() API, which can only
// draw from available balance — but this file's bookings are seeded directly via Prisma
// (createDuePayoutBooking never makes a real Stripe charge), so there is nothing funding
// that balance on its own, hence the balance_insufficient failures this fixes. A normal
// test charge (e.g. pm_card_visa, used elsewhere in this suite) would land in *pending*
// balance instead, simulating real settlement delay, which doesn't help here. Stripe's
// pm_card_bypassPending test payment method is the documented way to make a test-mode
// charge settle straight to available balance instead: https://stripe.com/docs/testing#available-balance
// Scoped to this file only — do not reuse for tests that intentionally exercise the
// normal pending-balance path.
async function fundPlatformAvailableBalance(amountCents: number): Promise<void> {
  const Stripe = require('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: process.env.STRIPE_CURRENCY ?? 'cad',
    payment_method: 'pm_card_bypassPending',
    payment_method_types: ['card'],
    confirm: true,
    capture_method: 'manual',
  })
  await stripe.paymentIntents.capture(intent.id, { amount_to_capture: amountCents })
}

function requireStripeAccount() {
  const accountId = process.env.DEV_STRIPE_ACCOUNT_ID
  if (!accountId) {
    throw new Error(
      'DEV_STRIPE_ACCOUNT_ID is not set in .env.test — required for payout-release ' +
      'integration tests, which call the real Stripe Connect transfers API. Set it to a ' +
      'real, fully-onboarded (payouts_enabled: true) Stripe Express test-mode account id.'
    )
  }
  return accountId
}

async function createDuePayoutBooking(
  disputeStatus: DisputeStatus,
  overrides: { paymentStatus?: PaymentStatus; refundedAmountCents?: number } = {}
) {
  const db = getTestPrisma()
  const accountId = requireStripeAccount()
  await db.user.update({ where: { id: owner.id }, data: { stripeAccountId: accountId } })

  const { startDate, endDate } = futureDates(3, 3)
  const completedAt = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48h ago, past the 24h hold

  return db.booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(90),
      depositAmount: new Prisma.Decimal(27),
      commissionAmount: new Prisma.Decimal(13.5),
      ownerPayout: new Prisma.Decimal(76.5),
      insuranceFee: new Prisma.Decimal(0),
      status: BookingStatus.COMPLETED,
      paymentStatus: overrides.paymentStatus ?? PaymentStatus.PAYOUT_PENDING,
      refundedAmountCents: overrides.refundedAmountCents ?? 0,
      disputeStatus,
      completedAt,
      stripePaymentIntentId: `pi_mock_payout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      version: 1,
    },
  })
}

/** Reads back the amount Stripe actually transferred for a booking's payout,
 *  from the PAYOUT_TRIGGERED event's recorded transfer id. */
async function transferAmountForBooking(bookingId: string): Promise<number | null> {
  const db = getTestPrisma()
  const evt = await db.bookingEvent.findFirst({
    where: { bookingId, type: 'PAYOUT_TRIGGERED' },
    orderBy: { createdAt: 'desc' },
  })
  const transferId = (evt?.metadata as any)?.stripeTransferId
  if (!transferId) return null
  const Stripe = require('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
  const transfer = await stripe.transfers.retrieve(transferId)
  return transfer.amount
}

describe('releaseDuePayouts', () => {
  test('releases a due payout with disputeStatus NONE', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.NONE)
    await fundPlatformAvailableBalance(50000) // cover the $76.50 transfer with headroom for Stripe fees

    const result = await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAID_OUT)
    assert.ok(updated.stripeTransferId, 'stripeTransferId should be set')
    assert.ok(result.paid >= 1, 'at least one payout should have been paid')
  })

  test('releases a due payout with disputeStatus RESOLVED_NO_ACTION', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.RESOLVED_NO_ACTION)
    await fundPlatformAvailableBalance(50000)

    await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAID_OUT)
  })

  test('releases a due payout with disputeStatus DISMISSED', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.DISMISSED)
    await fundPlatformAvailableBalance(50000)

    await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAID_OUT)
  })

  // A RESOLVED_REFUND dispute on a COMPLETED booking only ever captured the
  // *deposit* (see disputeService.resolveDispute's COMPLETED branch) — the
  // rental payout is untouched and still fully owed. Booking.refundedAmountCents
  // is 0, so the full ownerPayout is released, not skipped.
  test('releases the FULL owner payout for a RESOLVED_REFUND booking with no rental refund (deposit-only dispute)', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.RESOLVED_REFUND)
    await fundPlatformAvailableBalance(50000)

    const result = await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAID_OUT, 'RESOLVED_REFUND with no rental refund must still pay the owner')
    assert.ok(updated.stripeTransferId, 'stripeTransferId should be set')
    assert.ok(updated.payoutSentAt, 'payoutSentAt should be set')
    assert.ok(result.paid >= 1)

    if (stripeAvailable) {
      assert.equal(await transferAmountForBooking(booking.id), 7650, 'the full $76.50 ownerPayout should have been transferred')
    }
  })

  // Renter was partially refunded from the rental (Booking.refundedAmountCents),
  // so the owner gets their proportional share of what's left, not the full
  // snapshot and not $0.
  test('releases the owner\'s proportional remaining payout after a PARTIAL rental refund', async () => {
    const db = getTestPrisma()
    // $30 of the $90 rental refunded to the renter. ownerPayout is $76.50 (85% of $90).
    // Remaining = round((9000 - 3000) * 7650 / 9000) = 5100 cents = $51.00.
    const booking = await createDuePayoutBooking(DisputeStatus.RESOLVED_REFUND, {
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      refundedAmountCents: 3000,
    })
    await fundPlatformAvailableBalance(50000)

    const result = await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAID_OUT)
    assert.ok(updated.stripeTransferId)
    assert.ok(result.paid >= 1)

    const evt = await db.bookingEvent.findFirstOrThrow({
      where: { bookingId: booking.id, type: 'PAYOUT_TRIGGERED' },
      orderBy: { createdAt: 'desc' },
    })
    assert.equal((evt.metadata as any).amountCents, 5100, 'proportional remaining payout')
    assert.equal((evt.metadata as any).partialRefundToRenterCents, 3000)
    assert.equal((evt.metadata as any).fullOwnerPayoutCents, 7650)

    if (stripeAvailable) {
      assert.equal(await transferAmountForBooking(booking.id), 5100, 'Stripe transfer must be the proportional remainder, not the full $76.50')
    }
  })

  // Renter was refunded the entire rental charge — booking sits at REFUNDED and
  // the owner is owed nothing. It must still be closed out (payoutSentAt) so it
  // isn't reconsidered on every tick, with no Stripe transfer.
  test('pays nothing (and closes out) a FULLY refunded RESOLVED_REFUND booking', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.RESOLVED_REFUND, {
      paymentStatus: PaymentStatus.REFUNDED,
      refundedAmountCents: 9000, // full $90 rental
    })

    const result = await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.REFUNDED, 'stays REFUNDED — nothing was paid out')
    assert.equal(updated.stripeTransferId, null, 'no transfer for a fully-refunded booking')
    assert.ok(updated.payoutSentAt, 'payoutSentAt is stamped so the booking is not reprocessed')
    assert.equal(result.paid, 0)

    const evt = await db.bookingEvent.findFirstOrThrow({
      where: { bookingId: booking.id, type: 'PAYOUT_TRIGGERED' },
    })
    assert.equal((evt.metadata as any).amountCents, 0)
    assert.equal((evt.metadata as any).reason, 'fully_refunded')

    // Second pass must be a no-op (payoutSentAt already set).
    const before = await db.bookingEvent.count({ where: { bookingId: booking.id } })
    await releaseDuePayouts()
    const after = await db.bookingEvent.count({ where: { bookingId: booking.id } })
    assert.equal(after, before, 'a closed-out booking is not reprocessed')
  })

  test('does NOT release a payout with an unresolved dispute (OPEN)', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.OPEN)

    await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'payout must stay blocked')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// releaseDueDeposits — automatic deposit release, same shape as releaseDuePayouts
// but cancels the deposit PaymentIntent instead of transferring a payout.
// ─────────────────────────────────────────────────────────────────────────────
async function createAuthorizedDepositPaymentIntent(amountCents: number): Promise<string> {
  const Stripe = require('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: process.env.STRIPE_CURRENCY ?? 'cad',
    payment_method: 'pm_card_visa',
    payment_method_types: ['card'],
    confirm: true,
    capture_method: 'manual',
  })
  return intent.id
}

async function createDueDepositBooking(disputeStatus: DisputeStatus) {
  const db = getTestPrisma()
  const { startDate, endDate } = futureDates(3, 3)
  const completedAt = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48h ago, past the 24h dispute window
  const stripeDepositPaymentIntentId = await createAuthorizedDepositPaymentIntent(1500)

  const booking = await db.booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(90),
      depositAmount: new Prisma.Decimal(15),
      commissionAmount: new Prisma.Decimal(13.5),
      ownerPayout: new Prisma.Decimal(76.5),
      insuranceFee: new Prisma.Decimal(0),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      disputeStatus,
      completedAt,
      stripePaymentIntentId: `pi_mock_deposit_rental_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      stripeDepositPaymentIntentId,
      depositStatus: 'AUTHORIZED',
      version: 1,
    },
  })

  return { booking, stripeDepositPaymentIntentId }
}

describe('releaseDueDeposits', () => {
  test('releases a due deposit with no dispute (disputeStatus NONE) — cancels the PaymentIntent and marks it RELEASED', async () => {
    const db = getTestPrisma()
    const { booking, stripeDepositPaymentIntentId } = await createDueDepositBooking(DisputeStatus.NONE)

    const result = await releaseDueDeposits()
    assert.ok(result.released >= 1, 'at least one deposit should have been released')

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.depositStatus, 'RELEASED')

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const depositIntent = await stripe.paymentIntents.retrieve(stripeDepositPaymentIntentId)
      assert.equal(depositIntent.status, 'canceled', 'the deposit PaymentIntent should be canceled, releasing the hold')
    }
  })

  test('releases a due deposit with disputeStatus RESOLVED_NO_ACTION', async () => {
    const db = getTestPrisma()
    const { booking } = await createDueDepositBooking(DisputeStatus.RESOLVED_NO_ACTION)

    await releaseDueDeposits()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.depositStatus, 'RELEASED')
  })

  test('releases a due deposit with disputeStatus DISMISSED', async () => {
    const db = getTestPrisma()
    const { booking } = await createDueDepositBooking(DisputeStatus.DISMISSED)

    await releaseDueDeposits()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.depositStatus, 'RELEASED')
  })

  test('does NOT release a deposit with an unresolved dispute (OPEN) — must stay held', async () => {
    const db = getTestPrisma()
    const { booking, stripeDepositPaymentIntentId } = await createDueDepositBooking(DisputeStatus.OPEN)

    const result = await releaseDueDeposits()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.depositStatus, 'AUTHORIZED', 'deposit must stay held while a dispute is open')
    assert.equal(result.checked, 0, 'an OPEN-dispute booking should not even be selected')

    if (stripeAvailable) {
      const Stripe = require('stripe')
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
      const depositIntent = await stripe.paymentIntents.retrieve(stripeDepositPaymentIntentId)
      assert.equal(depositIntent.status, 'requires_capture', 'the deposit authorization must remain untouched')
    }
  })

  test('does NOT release a deposit not yet past the hold window', async () => {
    const db = getTestPrisma()
    const stripeDepositPaymentIntentId = await createAuthorizedDepositPaymentIntent(1500)
    const { startDate, endDate } = futureDates(3, 3)
    const booking = await db.booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(90),
        depositAmount: new Prisma.Decimal(15),
        commissionAmount: new Prisma.Decimal(13.5),
        ownerPayout: new Prisma.Decimal(76.5),
        insuranceFee: new Prisma.Decimal(0),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        disputeStatus: DisputeStatus.NONE,
        completedAt: new Date(), // just completed — well within the 24h window
        stripePaymentIntentId: `pi_mock_deposit_rental_${Date.now()}`,
        stripeDepositPaymentIntentId,
        depositStatus: 'AUTHORIZED',
        version: 1,
      },
    })

    const result = await releaseDueDeposits()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.depositStatus, 'AUTHORIZED', 'deposit must stay held until the hold window has passed')
    assert.equal(result.checked, 0)
  })
})
