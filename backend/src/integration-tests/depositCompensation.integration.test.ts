/**
 * Integration Tests — the owner's deposit compensation
 * ====================================================
 * When a dispute charges the renter's deposit, the captured amount is
 * transferred to the owner from that deposit's charge. A transfer that fails
 * at resolution time is left recorded as owed and retried by a job, instead
 * of being swallowed. Stripe is mocked on the paymentService module.
 */
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
} from './setup'
import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { BookingStatus, DepositStatus, DisputeStatus, PaymentStatus, Prisma, Role } from '@prisma/client'
import * as paymentService from '../services/paymentService'
import { createDispute, resolveDispute } from '../services/disputeService'
import { retryDepositCompensations } from '../services/cleanupJob'

let owner: { id: string }
let renter: { id: string }
let admin: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_compensation' })
  renter = await createTestUser({ firstName: 'Renter' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  listingId = (await createTestListing(owner.id)).id
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

async function disputedCompletedBooking() {
  const { startDate, endDate } = futureDates(3, 2)
  const booking = await getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(50),
      depositAmount: new Prisma.Decimal(30),
      commissionAmount: new Prisma.Decimal(7.5),
      ownerPayout: new Prisma.Decimal(42.5),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      completedAt: new Date(),
      stripePaymentIntentId: 'pi_rent_comp',
      depositStatus: DepositStatus.AUTHORIZED,
      stripeDepositPaymentIntentId: 'pi_dep_comp',
    },
  })
  const dispute = await createDispute(booking.id, owner.id, 'ITEM_DAMAGED', 'The item came back with a cracked screen.')
  return { booking, dispute }
}

describe('deposit compensation', () => {
  test('is transferred from the deposit charge and recorded on the booking', async () => {
    mock.method(paymentService, 'captureDepositPaymentIntent', async () => ({ id: 'pi_dep_comp', status: 'succeeded', latest_charge: 'ch_dep_1' }))
    const transfer = mock.method(paymentService, 'transferDepositCompensation', async () => ({ id: 'tr_comp_1' }))
    const { booking, dispute } = await disputedCompletedBooking()

    await resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage confirmed.', 2000)

    assert.equal(transfer.mock.callCount(), 1)
    const [, account, amount, disputeId, source] = transfer.mock.calls[0].arguments
    assert.deepEqual([account, amount, disputeId, source], ['acct_test_compensation', 2000, dispute.id, 'ch_dep_1'])
    const after = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(after.stripeDepositChargeId, 'ch_dep_1')
    assert.equal(after.stripeDepositTransferId, 'tr_comp_1')
  })

  test('a transfer that fails at resolution is retried by the job, once', async () => {
    mock.method(paymentService, 'captureDepositPaymentIntent', async () => ({ id: 'pi_dep_comp', status: 'succeeded', latest_charge: 'ch_dep_2' }))
    let fail = true
    const transfer = mock.method(paymentService, 'transferDepositCompensation', async () => {
      if (fail) throw new Error('Insufficient funds in Stripe account.')
      return { id: 'tr_comp_retry' }
    })
    const { booking, dispute } = await disputedCompletedBooking()

    await resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage confirmed.', 1500)
    const owed = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(owed.depositStatus, DepositStatus.CAPTURED, 'the resolution itself still went through')
    assert.equal(owed.stripeDepositTransferId, null)

    fail = false
    assert.equal((await retryDepositCompensations()).paid, 1)
    assert.equal((await retryDepositCompensations()).checked, 0, 'nothing is owed once it has been paid')

    assert.equal(transfer.mock.callCount(), 2)
    const retry = transfer.mock.calls[1].arguments
    assert.deepEqual([retry[2], retry[3], retry[4]], [1500, dispute.id, 'ch_dep_2'], 'same amount, same dispute key, same charge')
    const paid = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(paid.stripeDepositTransferId, 'tr_comp_retry')
  })
})
