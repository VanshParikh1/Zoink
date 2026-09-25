/**
 * Integration Tests — notifications never reject into fire-and-forget callers
 * ==========================================================================
 * Callers run `void notifyUser(...)` after the main action has committed. If
 * the notification write failed (a recipient deleted in the meantime, a DB
 * blip), the rejection was unhandled — and without Sentry's handler installed
 * an unhandled rejection terminates the Node process. notifyUser now handles
 * its own failures.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { truncateAllTables, createTestUser, getTestPrisma, disconnectTestPrisma } from './setup'
import { notifyUser } from '../services/notificationService'

beforeEach(async () => {
  await truncateAllTables()
})

after(async () => {
  await disconnectTestPrisma()
})

describe('notifyUser', () => {
  test('resolves (and writes nothing) when the recipient no longer exists', async () => {
    await assert.doesNotReject(
      notifyUser({
        userId: '00000000-0000-0000-0000-000000000000',
        type: 'MESSAGE_RECEIVED',
        title: 'New message on Zoink',
        body: 'hi',
      })
    )
    assert.equal(await getTestPrisma().notification.count(), 0)
  })

  test('resolves when the database write fails', async () => {
    const user = await createTestUser({ firstName: 'Recipient' })
    const prisma = getTestPrisma() as any
    const original = prisma.notification.create
    prisma.notification.create = async () => {
      throw new Error('Connection terminated unexpectedly')
    }
    try {
      await assert.doesNotReject(
        notifyUser({ userId: user.id, type: 'BOOKING_REQUEST', title: 'New booking request', body: 'x' })
      )
    } finally {
      prisma.notification.create = original
    }
  })

  test('still records the notification when everything works', async () => {
    const user = await createTestUser({ firstName: 'Recipient' })
    await notifyUser({ userId: user.id, type: 'BOOKING_REQUEST', title: 'New booking request', body: 'x' })
    assert.equal(await getTestPrisma().notification.count({ where: { userId: user.id } }), 1)
  })
})
