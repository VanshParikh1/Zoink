/**
 * Integration Tests — P1-1: a deposit charge survives a crash at any point
 * ========================================================================
 * The decision to charge is committed before Stripe is called; the capture and
 * the owner's transfer run outside the DB transaction. These tests stop the
 * flow at each crash point and check that the webhook, reconciliation, the
 * retry job and the admin's own retry together end where one clean attempt
 * would: the deposit captured once, linked to its charge, the owner paid once.
 * Stripe is mocked on the paymentService module.
 */
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma, getApp, buildSignedWebhookPayload } from './setup'
import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { BookingStatus, DepositStatus, DisputeStatus, PaymentStatus, Prisma, Role } from '@prisma/client'
import * as paymentService from '../services/paymentService'
import { createDispute, resolveDispute } from '../services/disputeService'
import { closeOutBooking } from '../services/closeOutService'
import { releaseDueDeposits, retryDepositCompensations } from '../services/cleanupJob'
import { linkCapturedDeposits } from '../services/reconciliationJob'

let owner: { id: string }
let renter: { id: string }
let admin: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_recovery' })
  renter = await createTestUser({ firstName: 'Renter' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  listingId = (await createTestListing(owner.id)).id
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

const db = () => getTestPrisma()

function booking(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  const { startDate, endDate } = futureDates(3, 2)
  return db().booking.create({
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
      stripePaymentIntentId: `pi_rent_${Math.random().toString(36).slice(2)}`,
      depositStatus: DepositStatus.AUTHORIZED,
      stripeDepositPaymentIntentId: `pi_dep_${Math.random().toString(36).slice(2)}`,
      ...overrides,
    },
  })
}

/** Stripe captured, but the response never came back (timeout / process killed). */
function captureLandsButResponseLost(chargeId: string) {
  let lost = true
  const capture = mock.method(paymentService, 'captureDepositPaymentIntent', async (_b: any, cents: number) => {
    if (lost) throw new Error('socket hang up')
    return { status: 'succeeded', amount_received: cents, latest_charge: chargeId }
  })
  const retrieve = mock.method(paymentService, 'retrievePaymentIntent', async () => {
    if (lost) throw new Error('Stripe unreachable')
    return { status: 'succeeded', latest_charge: chargeId }
  })
  return { capture, retrieve, recover: () => (lost = false) }
}

async function deliverDepositSucceeded(bookingId: string, piId: string, chargeId: string) {
  const { body, signature } = buildSignedWebhookPayload(
    'payment_intent.succeeded',
    { id: piId, object: 'payment_intent', latest_charge: chargeId, metadata: { purpose: 'deposit' } },
    bookingId
  )
  const req = supertest(getApp()).post('/stripe/webhook').set('Content-Type', 'application/json')
  if (signature) req.set('stripe-signature', signature)
  const res = await req.send(body.toString('utf8'))
  assert.equal(res.status, 200, JSON.stringify(res.body))
}

describe('P1-1 deposit charge recovery', () => {
  test('resolution: capture lands but the request dies; the webhook links it, the job pays once, the retry finishes', async () => {
    const b = await booking()
    const dispute = await createDispute(b.id, owner.id, 'ITEM_DAMAGED', 'Cracked screen on return.')
    const stripe = captureLandsButResponseLost('ch_lost_1')
    const transfer = mock.method(paymentService, 'transferDepositCompensation', async () => ({ id: 'tr_once' }))
    mock.method(paymentService, 'findDepositCompensationTransfer', async () => null)

    await assert.rejects(resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage.', 2000))
    let row = await db().booking.findUniqueOrThrow({ where: { id: b.id } })
    assert.equal(row.depositCaptureCents, 2000, 'the decision was committed before Stripe was called')
    assert.equal((await db().dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status, DisputeStatus.OPEN)

    // The deposit job never releases a hold with a started charge, even past its window.
    await db().booking.update({ where: { id: b.id }, data: { completedAt: new Date(Date.now() - 48 * 3600_000), disputeStatus: DisputeStatus.RESOLVED_NO_ACTION } })
    const cancel = mock.method(paymentService, 'cancelDepositPaymentIntent', async () => ({ status: 'canceled' }))
    assert.equal((await releaseDueDeposits()).released, 0)
    assert.equal(cancel.mock.callCount(), 0)
    await db().booking.update({ where: { id: b.id }, data: { disputeStatus: DisputeStatus.OPEN } })

    await deliverDepositSucceeded(b.id, b.stripeDepositPaymentIntentId!, 'ch_lost_1')
    row = await db().booking.findUniqueOrThrow({ where: { id: b.id } })
    assert.equal(row.stripeDepositChargeId, 'ch_lost_1')
    assert.equal(row.depositStatus, DepositStatus.CAPTURED)

    assert.equal((await retryDepositCompensations()).paid, 1)
    assert.equal(transfer.mock.callCount(), 1)
    assert.deepEqual(transfer.mock.calls[0].arguments, [{ id: b.id }, 'acct_test_recovery', 2000, 'ch_lost_1'])

    // Another outcome can't replace the started charge; a different amount neither.
    await assert.rejects(resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_NO_ACTION, 'Never mind.'), /already started/)
    await assert.rejects(resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage.', 1000), /already started/)

    // The admin's retry: same capture back, dispute resolved, owner not paid again.
    stripe.recover()
    await resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage.', 2000)
    row = await db().booking.findUniqueOrThrow({ where: { id: b.id } })
    const resolved = await db().dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    assert.equal(resolved.status, DisputeStatus.RESOLVED_REFUND)
    assert.equal(resolved.refundAmountCents, 2000)
    assert.equal(row.depositStatus, DepositStatus.CAPTURED)
    assert.equal(row.stripeDepositTransferId, 'tr_once')
    assert.equal(transfer.mock.callCount(), 1, 'the owner is paid exactly once')
    assert.equal((await retryDepositCompensations()).checked, 0)
  })

  test('reconciliation links a capture no webhook reported', async () => {
    const b = await booking()
    const dispute = await createDispute(b.id, owner.id, 'ITEM_DAMAGED', 'Cracked screen on return.')
    const stripe = captureLandsButResponseLost('ch_recon_1')
    const transfer = mock.method(paymentService, 'transferDepositCompensation', async () => ({ id: 'tr_recon' }))
    mock.method(paymentService, 'findDepositCompensationTransfer', async () => null)
    await assert.rejects(resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage.', 3000))

    // Before Stripe is reachable nothing is linked; once it is, the charge is.
    assert.equal((await linkCapturedDeposits()).linked, 0)
    stripe.recover()
    assert.equal((await linkCapturedDeposits()).linked, 1)
    assert.equal((await linkCapturedDeposits()).checked, 0, 'linked once')
    assert.equal((await retryDepositCompensations()).paid, 1)
    assert.deepEqual(transfer.mock.calls[0].arguments.slice(2), [3000, 'ch_recon_1'])
  })

  test('close-out: retried after a lost capture, it completes once and pays once', async () => {
    const b = await booking({ status: BookingStatus.ACTIVE, paymentStatus: PaymentStatus.CAPTURED, completedAt: null })
    const stripe = captureLandsButResponseLost('ch_close_1')
    const transfer = mock.method(paymentService, 'transferDepositCompensation', async () => ({ id: 'tr_close' }))

    await assert.rejects(closeOutBooking(b.id, admin.id, 'Never returned.', 2500))
    let row = await db().booking.findUniqueOrThrow({ where: { id: b.id } })
    assert.equal(row.status, BookingStatus.ACTIVE)
    assert.equal(row.depositCaptureCents, 2500)
    await assert.rejects(closeOutBooking(b.id, admin.id, 'Never returned.'), /already started/)
    await assert.rejects(closeOutBooking(b.id, admin.id, 'Never returned.', 1000), /already started/)

    stripe.recover()
    await closeOutBooking(b.id, admin.id, 'Never returned.', 2500)
    row = await db().booking.findUniqueOrThrow({ where: { id: b.id } })
    assert.equal(row.status, BookingStatus.COMPLETED)
    assert.equal(row.stripeDepositChargeId, 'ch_close_1')
    assert.equal(row.stripeDepositTransferId, 'tr_close')
    assert.equal(await db().dispute.count({ where: { bookingId: b.id } }), 1)
    assert.equal(transfer.mock.callCount(), 1)
    await assert.rejects(closeOutBooking(b.id, admin.id, 'Again.', 2500), /can be closed out/)
  })

  test('transfer accepted by Stripe but not recorded: the job finds it instead of sending another', async () => {
    const b = await booking()
    const dispute = await createDispute(b.id, owner.id, 'ITEM_DAMAGED', 'Cracked screen on return.')
    mock.method(paymentService, 'captureDepositPaymentIntent', async () => ({ status: 'succeeded', latest_charge: 'ch_tr_1' }))
    const transfer = mock.method(paymentService, 'transferDepositCompensation', async () => {
      throw new Error('socket hang up')
    })
    await resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage.', 1200)
    assert.equal((await db().booking.findUniqueOrThrow({ where: { id: b.id } })).stripeDepositTransferId, null)

    const find = mock.method(paymentService, 'findDepositCompensationTransfer', async () => ({ id: 'tr_already_sent' }))
    assert.equal((await retryDepositCompensations()).paid, 1)
    assert.equal(find.mock.calls[0].arguments[0], b.id)
    assert.equal(transfer.mock.callCount(), 1, 'no second transfer')
    assert.equal((await db().booking.findUniqueOrThrow({ where: { id: b.id } })).stripeDepositTransferId, 'tr_already_sent')
  })

  test('a hold that is gone: the started charge is cleared and the admin told', async () => {
    const b = await booking()
    const dispute = await createDispute(b.id, owner.id, 'ITEM_DAMAGED', 'Cracked screen on return.')
    mock.method(paymentService, 'captureDepositPaymentIntent', async () => {
      throw new Error('This PaymentIntent could not be captured because it has a status of canceled.')
    })
    mock.method(paymentService, 'retrievePaymentIntent', async () => ({ status: 'canceled' }))
    await assert.rejects(resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_REFUND, 'Damage.', 1000), /expired or was released/)
    const row = await db().booking.findUniqueOrThrow({ where: { id: b.id } })
    assert.equal(row.depositCaptureCents, null)
    assert.equal(row.depositStatus, DepositStatus.RELEASED)
    // The dispute can still be closed another way.
    await resolveDispute(dispute.id, admin.id, DisputeStatus.RESOLVED_NO_ACTION, 'Hold lapsed.')
  })
})
