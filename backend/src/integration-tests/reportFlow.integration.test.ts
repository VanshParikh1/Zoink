/**
 * Integration Tests — Abuse Reporting (Report Flow)
 * ===================================================
 * Tests the full report lifecycle against the real zoink_test database:
 * filing a report against a listing or user, admin listing/filtering, and
 * resolving (REVIEWED / DISMISSED).
 *
 * Unlike Dispute, Report has no "one open item per target" restriction —
 * multiple users can report the same bad listing or user independently.
 */

import test, { before, beforeEach, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import supertest from 'supertest'
import {
  truncateAllTables,
  createTestUser,
  createTestListing,
  getTestPrisma,
  disconnectTestPrisma,
  getApp,
} from './setup'
import * as reportService from '../services/reportService'
import { Role } from '@prisma/client'

let reporter: { id: string; email: string; token: string }
let otherReporter: { id: string; email: string; token: string }
let target: { id: string; email: string; token: string }
let admin: { id: string; email: string; token: string }
let listingId: string

beforeEach(async () => {
  await truncateAllTables()
  reporter = await createTestUser({ firstName: 'Reporter' })
  otherReporter = await createTestUser({ firstName: 'OtherReporter' })
  target = await createTestUser({ firstName: 'Target' })
  admin = await createTestUser({ firstName: 'Admin', role: Role.ADMIN })
  const listing = await createTestListing(target.id, { title: 'Suspicious Listing' })
  listingId = listing.id
})

after(async () => {
  await disconnectTestPrisma()
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. Filing a report — service layer
// ─────────────────────────────────────────────────────────────────────────────
describe('createReport — service layer', () => {
  test('a user can report a listing', async () => {
    const report = await reportService.createReport(
      reporter.id, 'LISTING', listingId, 'SCAM', 'This listing looks fake, price is way too low.'
    )

    assert.ok(report.id)
    assert.equal(report.reporterId, reporter.id)
    assert.equal(report.targetType, 'LISTING')
    assert.equal(report.targetId, listingId)
    assert.equal(report.reason, 'SCAM')
    assert.equal(report.status, 'OPEN')
  })

  test('a user can report another user', async () => {
    const report = await reportService.createReport(
      reporter.id, 'USER', target.id, 'HARASSMENT', 'Sent me threatening messages.'
    )

    assert.equal(report.targetType, 'USER')
    assert.equal(report.targetId, target.id)
    assert.equal(report.status, 'OPEN')
  })

  test('description is optional', async () => {
    const report = await reportService.createReport(
      reporter.id, 'USER', target.id, 'OTHER', undefined
    )

    assert.equal(report.description, null)
  })

  test('multiple users can report the same listing — no one-report-per-target restriction', async () => {
    await reportService.createReport(reporter.id, 'LISTING', listingId, 'SPAM', undefined)
    const second = await reportService.createReport(otherReporter.id, 'LISTING', listingId, 'SCAM', undefined)

    assert.ok(second.id)

    const db = getTestPrisma()
    const all = await db.report.findMany({ where: { targetId: listingId } })
    assert.equal(all.length, 2)
  })

  test('throws 404 for a non-existent user target', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await assert.rejects(
      () => reportService.createReport(reporter.id, 'USER', fakeId, 'OTHER', undefined),
      (err: any) => {
        assert.equal(err.statusCode, 404)
        return true
      }
    )
  })

  test('throws 404 for a non-existent listing target', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await assert.rejects(
      () => reportService.createReport(reporter.id, 'LISTING', fakeId, 'OTHER', undefined),
      (err: any) => {
        assert.equal(err.statusCode, 404)
        return true
      }
    )
  })

  test('throws 400 when a user tries to report themselves', async () => {
    await assert.rejects(
      () => reportService.createReport(reporter.id, 'USER', reporter.id, 'HARASSMENT', undefined),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /yourself/i)
        return true
      }
    )
  })

  test('throws 400 when a user tries to report their own listing', async () => {
    const ownListing = await createTestListing(reporter.id, { title: 'My Own Listing' })

    await assert.rejects(
      () => reportService.createReport(reporter.id, 'LISTING', ownListing.id, 'SPAM', undefined),
      (err: any) => {
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /own listing/i)
        return true
      }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. HTTP layer — POST /reports
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /reports — HTTP layer', () => {
  test('verified user can file a report via HTTP — returns 201', async () => {
    const app = getApp()

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({
        targetType: 'LISTING',
        targetId: listingId,
        reason: 'SCAM',
        description: 'This listing looks fake, price is way too low.',
      })

    assert.equal(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.body)}`)
    assert.ok(res.body.id)
    assert.equal(res.body.status, 'OPEN')
    assert.equal(res.body.targetType, 'LISTING')
  })

  test('POST /reports succeeds without a description', async () => {
    const app = getApp()

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'USER', targetId: target.id, reason: 'INAPPROPRIATE' })

    assert.equal(res.status, 201)
    assert.equal(res.body.description, null)
  })

  test('POST /reports returns 400 with too-short description', async () => {
    const app = getApp()

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'SPAM', description: 'Bad.' })

    assert.equal(res.status, 400)
    assert.ok(res.body.error)
  })

  test('POST /reports returns 400 with invalid reason enum', async () => {
    const app = getApp()

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'NOT_A_REAL_REASON' })

    assert.equal(res.status, 400)
  })

  test('POST /reports returns 400 with invalid targetType', async () => {
    const app = getApp()

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'BOOKING', targetId: listingId, reason: 'SPAM' })

    assert.equal(res.status, 400)
  })

  test('POST /reports returns 404 for a non-existent target', async () => {
    const app = getApp()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'LISTING', targetId: fakeId, reason: 'SPAM' })

    assert.equal(res.status, 404)
  })

  test('POST /reports returns 401 without auth token', async () => {
    const app = getApp()

    const res = await supertest(app)
      .post('/reports')
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })

    assert.equal(res.status, 401)
  })

  test('a second report from a different user against the same listing also succeeds', async () => {
    const app = getApp()

    await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${otherReporter.token}`)
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'SCAM' })

    assert.equal(res.status, 201)
  })

  test('POST /reports returns 400 when a user tries to report themselves', async () => {
    const app = getApp()

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'USER', targetId: reporter.id, reason: 'OTHER' })

    assert.equal(res.status, 400)
  })

  test('POST /reports returns 400 when a user tries to report their own listing', async () => {
    const app = getApp()
    const ownListing = await createTestListing(reporter.id, { title: 'My Own Listing' })

    const res = await supertest(app)
      .post('/reports')
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ targetType: 'LISTING', targetId: ownListing.id, reason: 'SPAM' })

    assert.equal(res.status, 400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. HTTP layer — GET /admin/reports (list + filter)
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /admin/reports — HTTP layer', () => {
  test('admin can list all reports', async () => {
    const app = getApp()
    await reportService.createReport(reporter.id, 'LISTING', listingId, 'SPAM', undefined)
    await reportService.createReport(otherReporter.id, 'USER', target.id, 'HARASSMENT', undefined)

    const res = await supertest(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${admin.token}`)

    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body))
    assert.equal(res.body.length, 2)
  })

  test('admin can filter reports by status', async () => {
    const app = getApp()
    const r1 = await reportService.createReport(reporter.id, 'LISTING', listingId, 'SPAM', undefined)
    await reportService.createReport(otherReporter.id, 'USER', target.id, 'HARASSMENT', undefined)

    await reportService.resolveReport(r1.id, admin.id, 'DISMISSED', 'Not actionable.')

    const res = await supertest(app)
      .get('/admin/reports?status=OPEN')
      .set('Authorization', `Bearer ${admin.token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.length, 1)
    assert.equal(res.body[0].status, 'OPEN')
  })

  test('admin sees the listing title and reported user\'s name as targetLabel', async () => {
    const app = getApp()
    await reportService.createReport(reporter.id, 'LISTING', listingId, 'SPAM', undefined)
    await reportService.createReport(reporter.id, 'USER', target.id, 'HARASSMENT', undefined)

    const res = await supertest(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${admin.token}`)

    assert.equal(res.status, 200)
    const listingReport = res.body.find((r: any) => r.targetType === 'LISTING')
    const userReport = res.body.find((r: any) => r.targetType === 'USER')

    assert.equal(listingReport.targetLabel, 'Suspicious Listing')
    assert.equal(userReport.targetLabel, 'Target User')
  })

  test('admin sees a placeholder targetLabel when the reported listing was since deleted', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const deletable = await createTestListing(target.id, { title: 'Temporary Listing' })
    await reportService.createReport(reporter.id, 'LISTING', deletable.id, 'SCAM', undefined)

    await db.listing.delete({ where: { id: deletable.id } })

    const res = await supertest(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${admin.token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.length, 1)
    assert.equal(res.body[0].targetLabel, '[deleted listing]')
  })

  test('admin sees a placeholder targetLabel when the reported user was since deleted', async () => {
    const app = getApp()
    const db = getTestPrisma()
    const deletable = await createTestUser({ firstName: 'Deletable' })
    await reportService.createReport(reporter.id, 'USER', deletable.id, 'HARASSMENT', undefined)

    await db.user.delete({ where: { id: deletable.id } })

    const res = await supertest(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${admin.token}`)

    assert.equal(res.status, 200)
    assert.equal(res.body.length, 1)
    assert.equal(res.body[0].targetLabel, '[deleted user]')
  })

  test('non-admin USER role returns 403 on GET /admin/reports', async () => {
    const app = getApp()

    const res = await supertest(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${reporter.token}`)

    assert.equal(res.status, 403)
  })

  test('GET /admin/reports returns 401 without auth token', async () => {
    const app = getApp()

    const res = await supertest(app).get('/admin/reports')

    assert.equal(res.status, 401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. HTTP layer — PATCH /admin/reports/:id (resolve)
// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /admin/reports/:id — HTTP layer', () => {
  test('admin can mark a report REVIEWED via HTTP — returns 200', async () => {
    const app = getApp()
    const report = await reportService.createReport(reporter.id, 'LISTING', listingId, 'SCAM', undefined)

    const res = await supertest(app)
      .patch(`/admin/reports/${report.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'REVIEWED', adminNotes: 'Confirmed scam listing, escalating separately.' })

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`)
    assert.equal(res.body.status, 'REVIEWED')
    assert.ok(res.body.reviewedAt)
    assert.equal(res.body.reviewedByAdminId, admin.id)
    assert.equal(res.body.adminNotes, 'Confirmed scam listing, escalating separately.')
  })

  test('admin can dismiss a report without adminNotes', async () => {
    const app = getApp()
    const report = await reportService.createReport(reporter.id, 'USER', target.id, 'OTHER', undefined)

    const res = await supertest(app)
      .patch(`/admin/reports/${report.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'DISMISSED' })

    assert.equal(res.status, 200)
    assert.equal(res.body.status, 'DISMISSED')
  })

  test('resolving an already-resolved report returns 400', async () => {
    const app = getApp()
    const report = await reportService.createReport(reporter.id, 'LISTING', listingId, 'SPAM', undefined)
    await reportService.resolveReport(report.id, admin.id, 'DISMISSED', undefined)

    const res = await supertest(app)
      .patch(`/admin/reports/${report.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'REVIEWED' })

    assert.equal(res.status, 400)
  })

  test('non-admin USER role returns 403 on resolve endpoint', async () => {
    const app = getApp()
    const report = await reportService.createReport(reporter.id, 'LISTING', listingId, 'SPAM', undefined)

    const res = await supertest(app)
      .patch(`/admin/reports/${report.id}`)
      .set('Authorization', `Bearer ${reporter.token}`)
      .send({ status: 'DISMISSED' })

    assert.equal(res.status, 403)
  })

  test('resolve returns 404 for a non-existent report id', async () => {
    const app = getApp()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    const res = await supertest(app)
      .patch(`/admin/reports/${fakeId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'DISMISSED' })

    assert.equal(res.status, 404)
  })

  test('resolve returns 401 without auth token', async () => {
    const app = getApp()
    const report = await reportService.createReport(reporter.id, 'LISTING', listingId, 'SPAM', undefined)

    const res = await supertest(app)
      .patch(`/admin/reports/${report.id}`)
      .send({ status: 'DISMISSED' })

    assert.equal(res.status, 401)
  })
})
