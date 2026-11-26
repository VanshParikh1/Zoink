/**
 * Integration Tests — P3-12: payout source charge and permanent refusals
 * =======================================================================
 * The owner's payout names the rent's charge stored at capture; a booking
 * without one gets it looked up once and saved, so a retry sends the same
 * source. A permanent Stripe refusal (e.g. a restricted account) is recorded
 * once and parks the payout for an admin; a retryable error still retries.
 * Stripe is mocked on the paymentService module.
 */
import { truncateAllTables, createTestUser, createTestListing, futureDates, getTestPrisma, disconnectTestPrisma } from './setup'
import test, { beforeEach, afterEach, after, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client'
import * as paymentService from '../services/paymentService'
import { releaseDuePayouts } from '../services/cleanupJob'

let owner: { id: string }
let renter: { id: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  owner = await createTestUser({ firstName: 'Owner', stripeAccountId: 'acct_test_refusal' })
  renter = await createTestUser({ firstName: 'Renter' })
  listingId = (await createTestListing(owner.id)).id
})

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

function payable(overrides: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  const { startDate, endDate } = futureDates(3, 2)
  return getTestPrisma().booking.create({
    data: {
      listingId,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalPrice: new Prisma.Decimal(50),
      commissionAmount: new Prisma.Decimal(7.5),
      ownerPayout: new Prisma.Decimal(42.5),
      status: BookingStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAYOUT_PENDING,
      completedAt: new Date(Date.now() - 25 * 3600_000),
      stripePaymentIntentId: `pi_rent_${Math.random().toString(36).slice(2)}`,
      ...overrides,
    },
  })
}

const stripeError = (props: object) => Object.assign(new Error('Stripe said no'), props)
const errors = (bookingId: string) => getTestPrisma().bookingEvent.count({ where: { bookingId, type: 'ERROR' } })

describe('payout source charge and refusals (P3-12)', () => {
  test('a booking without a stored charge: looked up once, saved, and the same source on every attempt', async () => {
    const b = await payable({ stripeChargeId: null })
    let lookups = 0
    mock.method(paymentService, 'getPaymentIntentChargeId', async () => `ch_lookup_${++lookups}`)
    let fail = true
    const transfer = mock.method(paymentService, 'transferPayout', async () => {
      if (fail) throw stripeError({ type: 'StripeConnectionError' })
      return { id: 'tr_ok' }
    })
    assert.equal((await releaseDuePayouts()).failed, 1)
    fail = false
    assert.equal((await releaseDuePayouts()).paid, 1)
    const sources = transfer.mock.calls.map((c) => c.arguments[3])
    assert.deepEqual(sources, ['ch_lookup_1', 'ch_lookup_1'])
    assert.equal(lookups, 1)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: b.id } })).stripeChargeId, 'ch_lookup_1')
  })

  test('a stored charge is used as is, with no lookup', async () => {
    await payable({ stripeChargeId: 'ch_stored' })
    const lookup = mock.method(paymentService, 'getPaymentIntentChargeId', async () => 'ch_other')
    const transfer = mock.method(paymentService, 'transferPayout', async () => ({ id: 'tr_ok' }))
    assert.equal((await releaseDuePayouts()).paid, 1)
    assert.equal(transfer.mock.calls[0].arguments[3], 'ch_stored')
    assert.equal(lookup.mock.callCount(), 0)
  })

  test('a permanent refusal is recorded once, flagged, and not retried', async () => {
    const b = await payable({ stripeChargeId: 'ch_1' })
    const transfer = mock.method(paymentService, 'transferPayout', async () => {
      throw stripeError({ type: 'StripeInvalidRequestError', statusCode: 400, code: 'account_invalid' })
    })
    const first = await releaseDuePayouts()
    assert.deepEqual([first.failed, first.blocked], [1, 1])
    for (let i = 0; i < 3; i++) assert.equal((await releaseDuePayouts()).checked, 0)
    assert.equal(transfer.mock.callCount(), 1)
    assert.ok((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: b.id } })).payoutBlockedAt)
    assert.equal(await errors(b.id), 1)
  })

  test('retryable errors (network, server, rate limit, balance) keep retrying', async () => {
    const b = await payable({ stripeChargeId: 'ch_2' })
    const kinds = [
      { type: 'StripeConnectionError' },
      { type: 'StripeAPIError', statusCode: 500 },
      { type: 'StripeRateLimitError', statusCode: 429 },
      { type: 'StripeInvalidRequestError', statusCode: 400, code: 'balance_insufficient' },
    ]
    let i = 0
    const transfer = mock.method(paymentService, 'transferPayout', async () => {
      if (i < kinds.length) throw stripeError(kinds[i++])
      return { id: 'tr_finally' }
    })
    for (let run = 0; run < kinds.length; run++) assert.equal((await releaseDuePayouts()).blocked, 0)
    assert.equal((await releaseDuePayouts()).paid, 1)
    assert.equal(transfer.mock.callCount(), 5)
    assert.equal((await getTestPrisma().booking.findUniqueOrThrow({ where: { id: b.id } })).payoutBlockedAt, null)
  })
})
