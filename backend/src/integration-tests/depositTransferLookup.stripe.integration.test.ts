/**
 * Integration Tests — P1-1 lookup against real Stripe TEST mode
 * =============================================================
 * Skipped unless RUN_STRIPE_TRANSFER_TEST=1. Uses only the test-mode key and
 * DEV_STRIPE_ACCOUNT_ID from .env.test (setup.ts refuses anything but sk_test_).
 *
 * The case it covers: a deposit compensation Stripe accepted under the OLD
 * key (`deposit-payout-<bookingId>-<disputeId>`) whose DB write was lost.
 * The new key (`deposit-comp-<bookingId>`) can't dedupe it, so the retry job
 * must find it with findDepositCompensationTransfer (transfers.list by
 * destination, matched on metadata) and record it instead of sending another.
 *
 *   RUN_STRIPE_TRANSFER_TEST=1 NODE_ENV=test node --test --require ts-node/register \
 *     src/integration-tests/depositTransferLookup.stripe.integration.test.ts
 */
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, checkStripeConnectivity } from './setup'
import test, { after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { BookingStatus, DepositStatus, PaymentStatus, Prisma } from '@prisma/client'
import * as paymentService from '../services/paymentService'
import { retryDepositCompensations } from '../services/cleanupJob'

const ENABLED = process.env.RUN_STRIPE_TRANSFER_TEST === '1'
const ACCOUNT = process.env.DEV_STRIPE_ACCOUNT_ID

after(async () => disconnectTestPrisma())

function stripe() {
  const Stripe = require('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' })
}

describe('deposit compensation lookup, real Stripe test mode', () => {
  test('finds a transfer sent under the old key and sends no second one', { skip: !ENABLED && 'set RUN_STRIPE_TRANSFER_TEST=1' }, async (t) => {
    if (!ACCOUNT || !(await checkStripeConnectivity())) return t.skip('needs Stripe test mode and DEV_STRIPE_ACCOUNT_ID')
    assert.ok(process.env.STRIPE_SECRET_KEY!.startsWith('sk_test_'), 'test mode only')
    await truncateAllTables()
    const s = stripe()

    const owner = await createTestUser({ firstName: 'Owner', stripeAccountId: ACCOUNT })
    const renter = await createTestUser({ firstName: 'Renter' })
    const listingId = (await createTestListing(owner.id)).id
    const { startDate, endDate } = futureDates(3, 2)

    // A captured deposit: a real test charge whose funds are available at once.
    const intent = await s.paymentIntents.create({
      amount: 300,
      currency: process.env.STRIPE_CURRENCY ?? 'cad',
      payment_method: 'pm_card_bypassPending',
      payment_method_types: ['card'],
      confirm: true,
    })
    const chargeId = paymentService.chargeIdOf(intent)!
    const booking = await getTestPrisma().booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(20),
        depositAmount: new Prisma.Decimal(3),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        completedAt: new Date(),
        depositStatus: DepositStatus.CAPTURED,
        stripeDepositPaymentIntentId: intent.id,
        stripeDepositChargeId: chargeId,
        depositCaptureCents: 300,
      },
    })

    // The old code's transfer, accepted by Stripe, never recorded in the DB.
    const disputeId = `dispute_${Math.random().toString(36).slice(2)}`
    const old = await s.transfers.create(
      {
        amount: 300,
        currency: process.env.STRIPE_CURRENCY ?? 'cad',
        destination: ACCOUNT,
        source_transaction: chargeId,
        metadata: { bookingId: booking.id, disputeId, purpose: 'deposit_compensation' },
      },
      { idempotencyKey: `deposit-payout-${booking.id}-${disputeId}` }
    )

    const send = mock.method(paymentService, 'transferDepositCompensation')
    try {
      const found = await paymentService.findDepositCompensationTransfer(booking.id, ACCOUNT, booking.createdAt)
      assert.equal(found?.id, old.id, 'the lookup finds the old-key transfer')

      const result = await retryDepositCompensations()
      assert.deepEqual([result.paid, result.failed], [1, 0])
      assert.equal(send.mock.callCount(), 0, 'no second transfer was sent')
      const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
      assert.equal(row.stripeDepositTransferId, old.id)

      // And on Stripe: exactly one compensation transfer for this booking.
      const mine: string[] = []
      for await (const tr of s.transfers.list({ destination: ACCOUNT, created: { gte: Math.floor(booking.createdAt.getTime() / 1000) }, limit: 100 })) {
        if (tr.metadata?.bookingId === booking.id) mine.push(tr.id)
      }
      assert.deepEqual(mine, [old.id])
    } finally {
      send.mock.restore()
    }
  })
})
