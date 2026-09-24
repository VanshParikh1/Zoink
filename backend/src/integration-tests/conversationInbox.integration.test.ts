/**
 * Integration Tests — inbox (GET /conversations/me) query shape
 * =============================================================
 * The inbox is polled every few seconds. Its "last message per conversation"
 * used to be a nested `messages: { take: 1 }` select, which Prisma runs as
 * `WHERE "conversationId" IN (...)` with NO limit — pulling every message of
 * every conversation just to keep one each. These tests pin the response
 * (against the old nested select as an oracle) and that the messages read is
 * bounded by the number of conversations, not by message history.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  futureDates,
  getTestPrisma,
  disconnectTestPrisma,
} from './setup'
import { BookingStatus, Prisma } from '@prisma/client'
import * as conversationService from '../services/conversationService'

const MESSAGES_PER_CONVERSATION = 6

let renter: { id: string }
let owners: { id: string }[]
let conversationIds: string[]
let acceptedBookingId: string

beforeEach(async () => {
  await truncateAllTables()
  const db = getTestPrisma()
  renter = await createTestUser({ firstName: 'Renter' })
  owners = [await createTestUser({ firstName: 'OwnerA' }), await createTestUser({ firstName: 'OwnerB' }), await createTestUser({ firstName: 'OwnerC' })]
  conversationIds = []

  for (const [i, owner] of owners.entries()) {
    const listing = await createTestListing(owner.id, { title: `Item ${i}` })
    const conversation = await db.conversation.create({
      data: { listingId: listing.id, renterId: renter.id, ownerId: owner.id },
    })
    conversationIds.push(conversation.id)
    const base = Date.now() - 60 * 60 * 1000
    await db.message.createMany({
      data: Array.from({ length: MESSAGES_PER_CONVERSATION }, (_, k) => ({
        conversationId: conversation.id,
        // Last message of conversation 0 is from the owner (unread for the renter);
        // conversation 1's last message is the renter's own.
        senderId: (k + i) % 2 === 1 ? owner.id : renter.id,
        body: `c${i} message ${k}`,
        createdAt: new Date(base + (i * 100 + k) * 1000),
      })),
    })

    if (i === 0) {
      const { startDate, endDate } = futureDates(4, 2)
      const shared = {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        conversationId: conversation.id,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalPrice: new Prisma.Decimal(20),
      }
      acceptedBookingId = (await db.booking.create({ data: { ...shared, status: BookingStatus.ACCEPTED } })).id
      await db.booking.create({ data: { ...shared, status: BookingStatus.PENDING } })
    }
  }
})

after(async () => {
  await disconnectTestPrisma()
})

/** The pre-change nested select, used as the behavioural oracle. */
async function oracleLastMessages(userId: string) {
  const rows = await getTestPrisma().conversation.findMany({
    where: { OR: [{ renterId: userId }, { ownerId: userId }] },
    select: {
      id: true,
      messages: { select: { id: true, body: true, senderId: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      bookings: { where: { status: 'ACCEPTED' }, select: { id: true }, take: 1 },
    },
  })
  return new Map(rows.map((r) => [r.id, { lastMessage: r.messages[0] ?? null, accepted: r.bookings[0]?.id ?? null }]))
}

/** Records how many rows each statement touching the messages table returned.
 *  pg-pool calls client.query callback-style, so the callback is wrapped too. */
async function captureMessageRowCounts<T>(fn: () => Promise<T>): Promise<{ result: T; messageRows: number }> {
  const pg = require('pg')
  const original = pg.Client.prototype.query
  let messageRows = 0
  const count = (res: any) => { messageRows += res?.rowCount ?? 0 }
  pg.Client.prototype.query = function (config: any, values: any, cb: any) {
    const text: string = typeof config === 'string' ? config : config?.text ?? ''
    if (!/"messages"/.test(text)) return original.call(this, config, values, cb)
    if (typeof values === 'function') {
      const done = values
      return original.call(this, config, (err: any, res: any) => { if (!err) count(res); done(err, res) })
    }
    if (typeof cb === 'function') {
      const done = cb
      return original.call(this, config, values, (err: any, res: any) => { if (!err) count(res); done(err, res) })
    }
    const promise = original.call(this, config, values)
    promise?.then?.(count, () => {})
    return promise
  }
  try {
    const result = await fn()
    return { result, messageRows }
  } finally {
    pg.Client.prototype.query = original
  }
}

describe('getMyConversations', () => {
  test('returns the same last message, unread flag and accepted booking as the nested select did', async () => {
    const oracle = await oracleLastMessages(renter.id)
    const inbox = await conversationService.getMyConversations(renter.id)

    assert.equal(inbox.length, owners.length)
    for (const conversation of inbox) {
      const expected = oracle.get(conversation.id)!
      assert.deepEqual(conversation.lastMessage, expected.lastMessage)
      assert.deepEqual(Object.keys(conversation.lastMessage ?? {}).sort(), ['body', 'createdAt', 'id', 'senderId'])
      assert.equal(conversation.acceptedUnpaidBookingId, expected.accepted)
    }

    const byId = new Map(inbox.map((c) => [c.id, c]))
    assert.equal(byId.get(conversationIds[0])!.acceptedUnpaidBookingId, acceptedBookingId)
    assert.equal(byId.get(conversationIds[1])!.acceptedUnpaidBookingId, null)
    assert.equal(byId.get(conversationIds[0])!.unread, true, "owner's last message is unread for the renter")
    assert.equal(byId.get(conversationIds[1])!.unread, false, "the renter's own last message is never unread")
  })

  test('reads one message row per conversation, not the whole message history', async () => {
    const { result, messageRows } = await captureMessageRowCounts(() => conversationService.getMyConversations(renter.id))
    assert.equal(result.length, owners.length)
    assert.ok(
      messageRows <= owners.length,
      `expected at most ${owners.length} message rows, read ${messageRows} (history is ${owners.length * MESSAGES_PER_CONVERSATION})`
    )
  })

  test('a conversation with no messages yet has a null lastMessage', async () => {
    await getTestPrisma().message.deleteMany({ where: { conversationId: conversationIds[2] } })
    const inbox = await conversationService.getMyConversations(renter.id)
    const empty = inbox.find((c) => c.id === conversationIds[2])!
    assert.equal(empty.lastMessage, null)
    assert.equal(empty.unread, false)
  })
})
