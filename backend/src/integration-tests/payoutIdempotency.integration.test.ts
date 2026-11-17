/**
 * Integration Tests — an owner payout is sent once, even across a failed write
 * =========================================================================
 * Stripe is replaced with a fake that behaves like Stripe's idempotency layer:
 * a repeated key returns the transfer it already made. The first run's
 * transfer goes through but the job never records it (the response is lost,
 * as when the DB write after it fails); the deposit job then bumps the booking
 * version, and the payout job runs again.
 */
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
} from './setup'
import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'

type Transfer = { id: string; amount: number; destination: string }
const transfersByKey = new Map<string, Transfer>()
let loseNextResponse = false

class IdempotentStripe {
  transfers = {
    create: async (params: { amount: number; destination: string }, options: { idempotencyKey: string }) => {
      let transfer = transfersByKey.get(options.idempotencyKey)
      if (!transfer) {
        transfer = { id: `tr_fake_${transfersByKey.size + 1}`, amount: params.amount, destination: params.destination }
        transfersByKey.set(options.idempotencyKey, transfer)
      }
      if (loseNextResponse) {
        loseNextResponse = false
        throw new Error('An error occurred with our connection to Stripe.')
      }
      return transfer
    },
  }
}

// paymentService requires 'stripe' lazily on its first call, so this swap is
// in place before any client is built.
require('stripe')
require.cache[require.resolve('stripe')]!.exports = IdempotentStripe

import { releaseDuePayouts } from '../services/cleanupJob'

let owner: { id: string }
let renter: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  transfersByKey.clear()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_payout_once' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

after(async () => {
  await disconnectTestPrisma()
})

describe('releaseDuePayouts', () => {
  test('a transfer Stripe accepted but the job never recorded is not sent twice after the version moves', async () => {
    const { startDate, endDate } = futureDates(3, 2)
    const booking = await getTestPrisma().booking.create({
      data: {
        listingId,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(50),
        depositAmount: new Prisma.Decimal(0),
        commissionAmount: new Prisma.Decimal(7.5),
        ownerPayout: new Prisma.Decimal(42.5),
        status: BookingStatus.COMPLETED,
        paymentStatus: PaymentStatus.PAYOUT_PENDING,
        completedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        stripePaymentIntentId: 'pi_payout_once',
        version: 1,
      },
    })

    loseNextResponse = true
    const first = await releaseDuePayouts()
    assert.equal(first.failed, 1)
    const unrecorded = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(unrecorded.payoutSentAt, null, 'the job did not record the payout')

    // What releaseDueDeposits (or a webhook) does in between runs.
    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { version: { increment: 1 } } })

    const second = await releaseDuePayouts()
    assert.equal(second.paid, 1)
    assert.equal(transfersByKey.size, 1, 'Stripe made exactly one transfer')

    const paid = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(paid.paymentStatus, PaymentStatus.PAID_OUT)
    assert.equal(paid.stripeTransferId, 'tr_fake_1')
  })
})
