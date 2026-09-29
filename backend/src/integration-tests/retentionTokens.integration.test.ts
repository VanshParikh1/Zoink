/**
 * Integration Tests — verification codes are deleted within 24 hours
 * ==================================================================
 * privacy.md §7 promises verification codes are "expired or deleted within
 * 24 hours", but nothing ever deleted them. purgeOldVerificationTokens runs
 * with the 15-minute cleanup job and removes every code older than 24 hours,
 * used or not.
 */

import test, { beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { truncateAllTables, createTestUser, getTestPrisma, disconnectTestPrisma } from './setup'
import { purgeOldVerificationTokens } from '../services/cleanupJob'

const HOUR = 60 * 60 * 1000
let userId: string

beforeEach(async () => {
  await truncateAllTables()
  userId = (await createTestUser({ firstName: 'Retention' })).id
})

after(async () => {
  await disconnectTestPrisma()
})

async function tokenAged(hours: number, used: boolean) {
  const createdAt = new Date(Date.now() - hours * HOUR)
  return getTestPrisma().verificationToken.create({
    data: {
      userId,
      code: '123456',
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
      usedAt: used ? new Date(createdAt.getTime() + 60 * 1000) : null,
    },
  })
}

describe('purgeOldVerificationTokens', () => {
  test('deletes codes older than 24 hours, used or not, and keeps recent ones', async () => {
    const oldUnused = await tokenAged(25, false)
    const oldUsed = await tokenAged(72, true)
    const recent = await tokenAged(23, false)
    const fresh = await tokenAged(0, false)

    const result = await purgeOldVerificationTokens()
    assert.equal(result.deleted, 2)

    const remaining = (await getTestPrisma().verificationToken.findMany({ select: { id: true } })).map((t) => t.id).sort()
    assert.deepEqual(remaining, [recent.id, fresh.id].sort())
    assert.ok(![oldUnused.id, oldUsed.id].some((id) => remaining.includes(id)))
  })
})
