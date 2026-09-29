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

/** Runs fn and records every SQL statement it issued with its row count.
 *  pg-pool calls client.query callback-style, so the callback is wrapped too. */
async function captureStatements<T>(fn: () => Promise<T>): Promise<{ result: T; statements: { text: string; rowCount: number }[] }> {
  const pg = require('pg')
  const original = pg.Client.prototype.query
  const statements: { text: string; rowCount: number }[] = []
  pg.Client.prototype.query = function (config: any, values: any, cb: any) {
    const text: string = typeof config === 'string' ? config : config?.text ?? ''
    const record = (res: any) => { statements.push({ text, rowCount: res?.rowCount ?? 0 }) }
    if (typeof values === 'function') {
      const done = values
      return original.call(this, config, (err: any, res: any) => { if (!err) record(res); done(err, res) })
    }
    if (typeof cb === 'function') {
      const done = cb
      return original.call(this, config, values, (err: any, res: any) => { if (!err) record(res); done(err, res) })
    }
    const promise = original.call(this, config, values)
    promise?.then?.(record, () => {})
    return promise
  }
  try {
    const result = await fn()
    return { result, statements }
  } finally {
    pg.Client.prototype.query = original
  }
}

const touches = (table: string) => (s: { text: string }) => new RegExp(`(FROM|UPDATE|INTO) "(public"\\.")?${table}"`).test(s.text)

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
    const { result, statements } = await captureStatements(() => conversationService.getMyConversations(renter.id))
    const messageRows = statements.filter(touches('messages')).reduce((sum, s) => sum + s.rowCount, 0)
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

describe('chat thread poll', () => {
  test('getConversationById reads the conversation once and still enforces participation', async () => {
    const { result, statements } = await captureStatements(() => conversationService.getConversationById(renter.id, conversationIds[0]))
    assert.equal(result.id, conversationIds[0])
    assert.equal(result.lastMessage?.body, `c0 message ${MESSAGES_PER_CONVERSATION - 1}`)
    assert.equal(result.acceptedUnpaidBookingId, acceptedBookingId)
    assert.equal(statements.filter(touches('conversations')).length, 1, 'one conversation read per poll')

    const outsider = await createTestUser({ firstName: 'Outsider' })
    await assert.rejects(conversationService.getConversationById(outsider.id, conversationIds[0]), { statusCode: 403 })
    await assert.rejects(conversationService.getConversationById(renter.id, '00000000-0000-0000-0000-000000000000'), { statusCode: 404 })
  })

  test('markConversationRead writes only when a message is newer than the last read', async () => {
    const db = getTestPrisma()
    const conversationId = conversationIds[0]

    const first = await captureStatements(() => conversationService.markConversationRead(renter.id, conversationId))
    assert.equal(first.statements.filter((s) => /^UPDATE/.test(s.text.trim())).length, 1, 'unread messages -> marks read')
    const inboxAfterRead = await conversationService.getMyConversations(renter.id)
    assert.equal(inboxAfterRead.find((c) => c.id === conversationId)!.unread, false)

    const repeat = await captureStatements(() => conversationService.markConversationRead(renter.id, conversationId))
    assert.equal(repeat.statements.filter((s) => /^UPDATE/.test(s.text.trim())).length, 0, 'nothing new -> no write')

    await db.message.create({ data: { conversationId, senderId: owners[0].id, body: 'new one', createdAt: new Date(Date.now() + 1000) } })
    const inboxWithNew = await conversationService.getMyConversations(renter.id)
    assert.equal(inboxWithNew.find((c) => c.id === conversationId)!.unread, true)

    const afterNew = await captureStatements(() => conversationService.markConversationRead(renter.id, conversationId))
    assert.equal(afterNew.statements.filter((s) => /^UPDATE/.test(s.text.trim())).length, 1)
  })

  test('markConversationRead still rejects non-participants', async () => {
    const outsider = await createTestUser({ firstName: 'Outsider' })
    await assert.rejects(conversationService.markConversationRead(outsider.id, conversationIds[0]), { statusCode: 403 })
  })
})

// Build 5 opens a thread with no cursor, then polls forward with ?after=<last id>.
// Returning the OLDEST 100 on open made a >100-message thread open on stale
// history, and a send before catch-up moved the cursor past the unseen middle.
describe('GET /conversations/:id/messages paging', () => {
  async function seedLongThread(count: number) {
    const conversationId = conversationIds[1]
    const db = getTestPrisma()
    await db.message.deleteMany({ where: { conversationId } })
    const base = Date.now() - 24 * 60 * 60 * 1000
    await db.message.createMany({
      data: Array.from({ length: count }, (_, k) => ({
        conversationId,
        senderId: k % 2 ? renter.id : owners[1].id,
        body: `long ${k}`,
        createdAt: new Date(base + k * 1000),
      })),
    })
    return conversationId
  }

  test('without a cursor it returns the newest 100, oldest-first', async () => {
    const conversationId = await seedLongThread(130)
    const page = await conversationService.getConversationMessages(renter.id, conversationId)
    assert.equal(page.length, 100)
    assert.equal(page[0].body, 'long 30')
    assert.equal(page[99].body, 'long 129', 'the newest message is last, so it becomes the poll cursor')
    for (let i = 1; i < page.length; i++) {
      assert.ok(new Date(page[i].createdAt) >= new Date(page[i - 1].createdAt), 'ascending order')
    }
  })

  test('with a cursor it returns only newer messages, oldest-first', async () => {
    const conversationId = await seedLongThread(130)
    const cursor = (await getTestPrisma().message.findFirstOrThrow({ where: { conversationId, body: 'long 120' } })).id
    const page = await conversationService.getConversationMessages(renter.id, conversationId, cursor)
    assert.deepEqual(page.map((m) => m.body), Array.from({ length: 9 }, (_, k) => `long ${121 + k}`))
  })

  test("a cursor from another conversation is ignored rather than used as this thread's position", async () => {
    const conversationId = await seedLongThread(130)
    const foreignCursor = (await getTestPrisma().message.findFirstOrThrow({ where: { conversationId: conversationIds[0] } })).id
    const page = await conversationService.getConversationMessages(renter.id, conversationId, foreignCursor)
    assert.equal(page.length, 100)
    assert.equal(page[99].body, 'long 129')
  })
})
