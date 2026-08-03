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
import { releaseDuePayouts } from '../services/cleanupJob'
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

async function createDuePayoutBooking(disputeStatus: DisputeStatus) {
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
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      disputeStatus,
      completedAt,
      stripePaymentIntentId: `pi_mock_payout_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      version: 1,
    },
  })
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

  test('does NOT release a payout with disputeStatus RESOLVED_REFUND (would double-pay)', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.RESOLVED_REFUND)

    const result = await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'payout must stay blocked')
    assert.equal(updated.stripeTransferId, null)
    assert.equal(result.checked, 0, 'RESOLVED_REFUND booking should not even be selected')
  })

  test('does NOT release a payout with an unresolved dispute (OPEN)', async () => {
    const db = getTestPrisma()
    const booking = await createDuePayoutBooking(DisputeStatus.OPEN)

    await releaseDuePayouts()

    const updated = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(updated.paymentStatus, PaymentStatus.PAYOUT_PENDING, 'payout must stay blocked')
  })
})
