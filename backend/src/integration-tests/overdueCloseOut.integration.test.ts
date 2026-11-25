/**
 * Integration Tests — overdue rentals and admin close-out (F-01 / D-1)
 * ===================================================================
 * flagOverdueRentals flags an ACTIVE / RETURN_PENDING booking whose return
 * isn't done by the end of the day after endDate (Toronto), once, and tells
 * both parties. An admin closes it out: COMPLETED, payout on the normal
 * schedule, deposit optionally captured through the dispute capture path.
 * Stripe is mocked on the paymentService module.
 */
import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import { truncateAllTables, createTestUser, createTestListing, getTestPrisma, disconnectTestPrisma, getApp } from './setup'
import * as paymentService from '../services/paymentService'
import { flagOverdueRentals, releaseDueDeposits, releaseDuePayouts } from '../services/cleanupJob'
import { BookingStatus, DepositStatus, DisputeStatus, PaymentStatus, Prisma, Role } from '@prisma/client'

let owner: { id: string; token: string }
let renter: { id: string; token: string }
let admin: { id: string; token: string }
let listingId: string

// Ends Nov 12 2026: overdue from 00:00 EST Nov 14 = 05:00 UTC.
const END = new Date('2026-11-12T00:00:00.000Z')
const DEADLINE = new Date('2026-11-14T05:00:00.000Z')

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_closeout' })
  renter = await createTestUser({ firstName: 'Renter' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  listingId = (await createTestListing(owner.id, { title: 'Projector' })).id
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

function rental(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date('2026-11-10T00:00:00.000Z'),
      endDate: END,
      totalPrice: new Prisma.Decimal(60),
      depositAmount: new Prisma.Decimal(40),
      commissionAmount: new Prisma.Decimal(9),
      ownerPayout: new Prisma.Decimal(51),
      status: BookingStatus.ACTIVE,
      paymentStatus: PaymentStatus.CAPTURED,
      paidAt: new Date('2026-11-10T15:00:00.000Z'),
      pickedUpAt: new Date('2026-11-10T15:00:00.000Z'),
      stripePaymentIntentId: `pi_rent_${Math.random().toString(36).slice(2)}`,
      stripeChargeId: `ch_rent_${Math.random().toString(36).slice(2)}`,
      depositStatus: DepositStatus.AUTHORIZED,
      stripeDepositPaymentIntentId: `pi_dep_${Math.random().toString(36).slice(2)}`,
      version: 3,
      ...overrides,
    },
  })
}

const closeOut = (bookingId: string, body: object, token = admin.token) =>
  supertest(getApp()).post(`/admin/bookings/${bookingId}/close-out`).set('Authorization', `Bearer ${token}`).send(body)

const settle = () => new Promise((r) => setTimeout(r, 200)) // notifyUser is fire-and-forget

describe('flagOverdueRentals', () => {
  test('flags at the deadline once, records it and tells both parties', async () => {
    const booking = await rental()
    assert.equal((await flagOverdueRentals(new Date(DEADLINE.getTime() - 1000))).flagged, 0)

    assert.equal((await flagOverdueRentals(DEADLINE)).flagged, 1)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.deepEqual(row.overdueAt, DEADLINE)
    assert.equal(row.status, BookingStatus.ACTIVE, 'flagging changes nothing else')
    assert.equal(row.version, 3, 'no version bump, so a return tap is not refused')

    assert.equal((await flagOverdueRentals(new Date(DEADLINE.getTime() + 3600_000))).flagged, 0, 'only once')
    await settle()
    assert.equal(await getTestPrisma().bookingEvent.count({ where: { bookingId: booking.id, type: 'RENTAL_OVERDUE' } }), 1)
    const notes = await getTestPrisma().notification.findMany({ where: { type: 'RENTAL_OVERDUE' } })
    assert.deepEqual(notes.map((n) => n.userId).sort(), [owner.id, renter.id].sort())
  })

  test('RETURN_PENDING is flagged; completed, confirmed and cancelled bookings are not', async () => {
    const stuck = await rental({ status: BookingStatus.RETURN_PENDING })
    for (const status of [BookingStatus.COMPLETED, BookingStatus.CONFIRMED, BookingStatus.CANCELLED]) await rental({ status })
    assert.equal((await flagOverdueRentals(DEADLINE)).flagged, 1)
    assert.ok((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: stuck.id } })).overdueAt)
  })

  test('two overlapping runs flag once', async () => {
    const booking = await rental()
    const [a, b] = await Promise.all([flagOverdueRentals(DEADLINE), flagOverdueRentals(DEADLINE)])
    assert.equal(a.flagged + b.flagged, 1)
    assert.equal(await getTestPrisma().bookingEvent.count({ where: { bookingId: booking.id, type: 'RENTAL_OVERDUE' } }), 1)
  })

  test('a return completing while the job waits on the lock is not flagged', async () => {
    const booking = await rental({ status: BookingStatus.RETURN_PENDING })
    let release!: () => void
    let locked!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const held = new Promise<void>((r) => (locked = r))
    const returnTx = getTestPrisma().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`
      await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.COMPLETED, completedAt: new Date() } })
      locked()
      await gate
    }, { timeout: 20_000 })
    await held
    const job = flagOverdueRentals(DEADLINE)
    await new Promise((r) => setTimeout(r, 300))
    release()
    await returnTx
    assert.equal((await job).flagged, 0)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })).overdueAt, null)
  })
})

describe('admin close-out', () => {
  test('appears on the overdue list; closing out completes it and pays the owner on the normal schedule', async () => {
    const booking = await rental()
    await flagOverdueRentals(DEADLINE)
    const list = await supertest(getApp()).get('/admin/bookings/overdue').set('Authorization', `Bearer ${admin.token}`)
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.map((b: { id: string }) => b.id), [booking.id])

    const res = await closeOut(booking.id, { notes: 'Renter unreachable for 3 days; owner confirms item not back.' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(row.status, BookingStatus.COMPLETED)
    assert.equal(row.paymentStatus, PaymentStatus.PAYOUT_PENDING)
    assert.equal(row.depositStatus, DepositStatus.AUTHORIZED, 'no charge asked for: the hold is left to the normal release')
    const event = await getTestPrisma().bookingEvent.findFirstOrThrow({ where: { bookingId: booking.id, type: 'STATUS_CHANGE' } })
    assert.equal(event.actorId, admin.id)
    assert.equal((event.metadata as any).reason, 'admin_close_out')
    assert.match((event.metadata as any).notes, /unreachable/)
    assert.equal(await getTestPrisma().reviewObligation.count({ where: { bookingId: booking.id } }), 2)
    const after = await supertest(getApp()).get('/admin/bookings/overdue').set('Authorization', `Bearer ${admin.token}`)
    assert.deepEqual(after.body, [])
    await settle()
    const closed = await getTestPrisma().notification.findMany({ where: { type: 'BOOKING_CLOSED_OUT' } })
    const toRenter = closed.find((n) => n.userId === renter.id)
    const toOwner = closed.find((n) => n.userId === owner.id)
    assert.match(toRenter!.body, /closed out your rental of Projector\. Your \$40\.00 deposit hold will be released in 24 hours/)
    assert.match(toOwner!.body, /marked the rental of Projector as completed\. Your payout is due \w{3} \d{1,2}, /)

    // Not paid before the hold; paid in full after it.
    const transfer = mock.method(paymentService, 'transferPayout', async () => ({ id: 'tr_closeout' }))
    const cancelDeposit = mock.method(paymentService, 'cancelDepositPaymentIntent', async () => ({ status: 'canceled' }))
    assert.equal((await releaseDuePayouts()).paid, 0)
    await getTestPrisma().booking.update({ where: { id: booking.id }, data: { completedAt: new Date(Date.now() - 25 * 3600_000) } })
    assert.equal((await releaseDuePayouts()).paid, 1)
    assert.equal(transfer.mock.calls[0].arguments[2], 5100)
    assert.equal((await releaseDueDeposits()).released, 1)
    assert.equal(cancelDeposit.mock.callCount(), 1)
  })

  test('with a deposit charge: captures it, pays it to the owner and records a resolved dispute', async () => {
    const booking = await rental({ status: BookingStatus.RETURN_PENDING, overdueAt: DEADLINE })
    const capture = mock.method(paymentService, 'captureDepositPaymentIntent', async () => ({ status: 'succeeded', latest_charge: 'ch_dep_1' }))
    const comp = mock.method(paymentService, 'transferDepositCompensation', async () => ({ id: 'tr_dep_1' }))

    const res = await closeOut(booking.id, { notes: 'Item not returned.', depositCaptureCents: 4000 })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(capture.mock.calls[0].arguments[1], 4000)
    assert.equal(comp.mock.calls[0].arguments[2], 4000)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(row.status, BookingStatus.COMPLETED)
    assert.equal(row.depositStatus, DepositStatus.CAPTURED)
    assert.equal(row.stripeDepositChargeId, 'ch_dep_1')
    assert.equal(row.stripeDepositTransferId, 'tr_dep_1')
    assert.equal(row.refundedAmountCents, 0, 'the rent is untouched: the owner still gets the full payout')
    const dispute = await getTestPrisma().dispute.findFirstOrThrow({ where: { bookingId: booking.id } })
    assert.equal(dispute.status, DisputeStatus.RESOLVED_REFUND)
    assert.equal(dispute.reason, 'ITEM_NOT_RETURNED')
    assert.equal(dispute.refundAmountCents, 4000)
    assert.equal(dispute.resolvedByAdminId, admin.id)
    await settle()
    const closed = await getTestPrisma().notification.findMany({ where: { type: 'BOOKING_CLOSED_OUT' } })
    assert.match(closed.find((n) => n.userId === renter.id)!.body, /\$40\.00 of your \$40\.00 deposit was charged\.$/)
    assert.match(closed.find((n) => n.userId === owner.id)!.body, /\$40\.00 from the deposit is being sent to you\.$/)
  })

  test('a partial deposit charge tells the renter the rest was released', async () => {
    const booking = await rental()
    mock.method(paymentService, 'captureDepositPaymentIntent', async () => ({ status: 'succeeded', latest_charge: 'ch_dep_2' }))
    mock.method(paymentService, 'transferDepositCompensation', async () => ({ id: 'tr_dep_2' }))
    assert.equal((await closeOut(booking.id, { notes: 'Missing the remote.', depositCaptureCents: 1500 })).status, 200)
    await settle()
    const toRenter = await getTestPrisma().notification.findFirstOrThrow({ where: { type: 'BOOKING_CLOSED_OUT', userId: renter.id } })
    assert.match(toRenter.body, /\$15\.00 of your \$40\.00 deposit was charged and the rest of the hold was released\.$/)
  })

  test('refuses: over the deposit, no deposit hold, wrong status, open dispute with a charge, non-admin', async () => {
    const capture = mock.method(paymentService, 'captureDepositPaymentIntent', async () => ({ status: 'succeeded' }))
    const a = await rental()
    assert.equal((await closeOut(a.id, { notes: 'x', depositCaptureCents: 4001 })).status, 400)
    const noDeposit = await rental({ depositAmount: new Prisma.Decimal(0), depositStatus: null, stripeDepositPaymentIntentId: null })
    assert.equal((await closeOut(noDeposit.id, { notes: 'x', depositCaptureCents: 100 })).status, 400)
    const confirmed = await rental({ status: BookingStatus.CONFIRMED })
    assert.equal((await closeOut(confirmed.id, { notes: 'x' })).status, 400)
    const disputed = await rental({ disputeStatus: DisputeStatus.OPEN })
    await getTestPrisma().dispute.create({ data: { bookingId: disputed.id, raisedByUserId: owner.id, reason: 'ITEM_NOT_RETURNED', description: 'Not back yet.', status: 'OPEN' } })
    const res = await closeOut(disputed.id, { notes: 'x', depositCaptureCents: 100 })
    assert.equal(res.status, 400)
    assert.match(res.body.error, /open dispute/)
    assert.equal((await closeOut(a.id, { notes: 'x' }, owner.token)).status, 403)
    assert.equal((await closeOut(a.id, { notes: '' })).status, 400)
    assert.equal(capture.mock.callCount(), 0)
    // The open-dispute booking can still be closed out without a charge.
    assert.equal((await closeOut(disputed.id, { notes: 'Closing; deposit decided in the dispute.' })).status, 200)
  })

  test('before the overdue deadline: close-out without a charge works, with a charge is refused (P3-10)', async () => {
    const capture = mock.method(paymentService, 'captureDepositPaymentIntent', async () => ({ status: 'succeeded', latest_charge: 'ch_early' }))
    const lateNotOverdue = await rental({ endDate: new Date(Date.UTC(2099, 0, 1)) })
    const res = await closeOut(lateNotOverdue.id, { notes: 'Too early to charge.', depositCaptureCents: 1000 })
    assert.equal(res.status, 400)
    assert.match(res.body.error, /only be charged once the rental is overdue/)
    assert.equal(capture.mock.callCount(), 0)
    assert.equal((await closeOut(lateNotOverdue.id, { notes: 'Returned in person, confirmed by phone.' })).status, 200)
  })

  test('a failed deposit capture leaves the rental open', async () => {
    const booking = await rental()
    mock.method(paymentService, 'captureDepositPaymentIntent', async () => {
      throw new Error('authorization expired')
    })
    const res = await closeOut(booking.id, { notes: 'x', depositCaptureCents: 1000 })
    assert.equal(res.status, 500)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(row.status, BookingStatus.ACTIVE)
    assert.equal(row.depositStatus, DepositStatus.AUTHORIZED)
    assert.equal(await getTestPrisma().dispute.count({ where: { bookingId: booking.id } }), 0)
  })

  test('two close-outs at once: one completes it, the deposit is charged and paid once', async () => {
    const booking = await rental()
    // Both may reach Stripe; they send the same capture (one key per deposit PI),
    // which Stripe answers with one capture.
    const capture = mock.method(paymentService, 'captureDepositPaymentIntent', async () => {
      await new Promise((r) => setTimeout(r, 100))
      return { status: 'succeeded', latest_charge: 'ch_dep_race' }
    })
    const comp = mock.method(paymentService, 'transferDepositCompensation', async () => ({ id: 'tr_dep_race' }))
    const results = await Promise.all([
      closeOut(booking.id, { notes: 'first', depositCaptureCents: 2000 }),
      closeOut(booking.id, { notes: 'second', depositCaptureCents: 2000 }),
    ])
    const statuses = results.map((r) => r.status).sort()
    assert.ok(statuses[0] === 200 && [200, 400].includes(statuses[1]), JSON.stringify(statuses))
    assert.ok(capture.mock.calls.every((c) => c.arguments[1] === 2000))
    assert.equal(comp.mock.callCount(), 1)
    assert.equal(await getTestPrisma().dispute.count({ where: { bookingId: booking.id } }), 1)
    const row = await getTestPrisma().booking.findUniqueOrThrow({ where: { id: booking.id } })
    assert.equal(row.status, BookingStatus.COMPLETED)
    assert.equal(row.stripeDepositTransferId, 'tr_dep_race')
  })

})
