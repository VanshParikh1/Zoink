import { test, describe } from 'node:test'
import assert from 'node:assert'
import * as reportService from './reportService'

describe('reportService', () => {
  test('createReport throws NotFoundError when the reported user does not exist', async () => {
    const mockDb: any = {
      user: { findUnique: async () => null },
    }

    await assert.rejects(
      () => reportService.createReport('reporter-1', 'USER', 'missing-user', 'HARASSMENT', undefined, mockDb),
      (err: any) => {
        assert.strictEqual(err.statusCode, 404)
        assert.match(err.message, /user/i)
        return true
      }
    )
  })

  test('createReport throws NotFoundError when the reported listing does not exist', async () => {
    const mockDb: any = {
      listing: { findUnique: async () => null },
    }

    await assert.rejects(
      () => reportService.createReport('reporter-1', 'LISTING', 'missing-listing', 'SPAM', undefined, mockDb),
      (err: any) => {
        assert.strictEqual(err.statusCode, 404)
        assert.match(err.message, /listing/i)
        return true
      }
    )
  })

  test('createReport throws BadRequestError when a user reports themselves', async () => {
    const mockDb: any = {
      user: { findUnique: async () => ({ id: 'reporter-1' }) },
    }

    await assert.rejects(
      () => reportService.createReport('reporter-1', 'USER', 'reporter-1', 'HARASSMENT', undefined, mockDb),
      (err: any) => {
        assert.strictEqual(err.statusCode, 400)
        assert.match(err.message, /yourself/i)
        return true
      }
    )
  })

  test('createReport throws BadRequestError when a user reports their own listing', async () => {
    const mockDb: any = {
      listing: { findUnique: async () => ({ id: 'l-1', ownerId: 'reporter-1' }) },
    }

    await assert.rejects(
      () => reportService.createReport('reporter-1', 'LISTING', 'l-1', 'SPAM', undefined, mockDb),
      (err: any) => {
        assert.strictEqual(err.statusCode, 400)
        assert.match(err.message, /own listing/i)
        return true
      }
    )
  })

  test('createReport creates an OPEN report when the target exists', async () => {
    let createArgs: any = null
    const mockDb: any = {
      listing: { findUnique: async () => ({ id: 'l-1' }) },
      report: {
        create: async (args: any) => {
          createArgs = args
          return { id: 'r-1', ...args.data }
        },
      },
    }

    const report = await reportService.createReport('reporter-1', 'LISTING', 'l-1', 'SCAM', 'Looks fake.', mockDb)

    assert.strictEqual(report.status, 'OPEN')
    assert.strictEqual(createArgs.data.reporterId, 'reporter-1')
    assert.strictEqual(createArgs.data.targetType, 'LISTING')
    assert.strictEqual(createArgs.data.targetId, 'l-1')
    assert.strictEqual(createArgs.data.reason, 'SCAM')
  })

  test('resolveReport throws NotFoundError for a missing report', async () => {
    const mockDb: any = {
      report: { findUnique: async () => null },
    }

    await assert.rejects(
      () => reportService.resolveReport('missing-report', 'admin-1', 'DISMISSED', undefined, mockDb),
      (err: any) => {
        assert.strictEqual(err.statusCode, 404)
        return true
      }
    )
  })

  test('resolveReport throws BadRequestError when the report is already reviewed', async () => {
    const mockDb: any = {
      report: { findUnique: async () => ({ id: 'r-1', status: 'DISMISSED' }) },
    }

    await assert.rejects(
      () => reportService.resolveReport('r-1', 'admin-1', 'REVIEWED', undefined, mockDb),
      (err: any) => {
        assert.strictEqual(err.statusCode, 400)
        assert.match(err.message, /already been reviewed/i)
        return true
      }
    )
  })

  test('resolveReport sets status, adminNotes, reviewedByAdminId and reviewedAt', async () => {
    let updateArgs: any = null
    const mockDb: any = {
      report: {
        findUnique: async () => ({ id: 'r-1', status: 'OPEN' }),
        update: async (args: any) => {
          updateArgs = args
          return { id: 'r-1', ...args.data }
        },
      },
    }

    const resolved = await reportService.resolveReport('r-1', 'admin-1', 'REVIEWED', 'Confirmed spam.', mockDb)

    assert.strictEqual(resolved.status, 'REVIEWED')
    assert.strictEqual(updateArgs.data.adminNotes, 'Confirmed spam.')
    assert.strictEqual(updateArgs.data.reviewedByAdminId, 'admin-1')
    assert.ok(updateArgs.data.reviewedAt instanceof Date)
  })

  test('attachTargetLabels resolves a listing title and a user full name', async () => {
    const mockDb: any = {
      user: { findMany: async () => [{ id: 'u-1', firstName: 'Jane', lastName: 'Doe' }] },
      listing: { findMany: async () => [{ id: 'l-1', title: 'Vintage Bike' }] },
    }

    const reports = [
      { targetType: 'LISTING', targetId: 'l-1' },
      { targetType: 'USER', targetId: 'u-1' },
    ]

    const [listingReport, userReport] = await reportService.attachTargetLabels(reports as any, mockDb)

    assert.strictEqual(listingReport.targetLabel, 'Vintage Bike')
    assert.strictEqual(userReport.targetLabel, 'Jane Doe')
  })

  test('attachTargetLabels falls back to a placeholder when the target was deleted', async () => {
    const mockDb: any = {
      user: { findMany: async () => [] },
      listing: { findMany: async () => [] },
    }

    const reports = [
      { targetType: 'LISTING', targetId: 'deleted-listing' },
      { targetType: 'USER', targetId: 'deleted-user' },
    ]

    const [listingReport, userReport] = await reportService.attachTargetLabels(reports as any, mockDb)

    assert.strictEqual(listingReport.targetLabel, '[deleted listing]')
    assert.strictEqual(userReport.targetLabel, '[deleted user]')
  })

  test('attachTargetLabels skips the findMany calls for an empty report list', async () => {
    let userFindManyCalled = false
    let listingFindManyCalled = false
    const mockDb: any = {
      user: { findMany: async () => { userFindManyCalled = true; return [] } },
      listing: { findMany: async () => { listingFindManyCalled = true; return [] } },
    }

    const result = await reportService.attachTargetLabels([], mockDb)

    assert.deepStrictEqual(result, [])
    assert.strictEqual(userFindManyCalled, false)
    assert.strictEqual(listingFindManyCalled, false)
  })
})
