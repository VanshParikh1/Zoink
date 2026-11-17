/**
 * Integration Tests — GET /health reflects the database
 */
import { disconnectTestPrisma, getApp } from './setup'
import test, { after, afterEach, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import * as db from '../utils/prisma'

afterEach(() => mock.restoreAll())
after(async () => disconnectTestPrisma())

describe('GET /health', () => {
  test('200 when the database answers', async () => {
    const res = await supertest(getApp()).get('/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.database, 'ok')
  })

  test('503 when the database fails', async () => {
    mock.method(db, 'pingDatabase', async () => {
      throw new Error('connection refused')
    })
    const res = await supertest(getApp()).get('/health')
    assert.equal(res.status, 503)
    assert.equal(res.body.database, 'unavailable')
  })
})
