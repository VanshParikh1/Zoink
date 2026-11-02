import { test, describe, mock, beforeEach } from 'node:test'
import assert from 'node:assert'
import * as reportService from './reportService'
import * as emailService from './emailService'

// Every report emails support; no test may reach SES.
let sent: { to: string; subject: string; text: string }[] = []
let sendFails = false
mock.method(emailService, 'sendEmail', async (to: string, subject: string, text: string) => {
  sent.push({ to, subject, text })
  if (sendFails) throw new Error('SES is down')
})
beforeEach(() => {
  sent = []
  sendFails = false
})

const people: Record<string, any> = {
  'reporter-1': { id: 'reporter-1', firstName: 'Ria', lastName: 'Shah', email: 'ria@mail.utoronto.ca' },
  'owner-1': { id: 'owner-1', firstName: 'Omar', lastName: 'Ali', email: 'omar@mail.utoronto.ca' },
}
const createdReport = (data: any) => ({ id: 'report-1', createdAt: new Date('2026-11-02T12:00:00Z'), ...data })
// Lets the un-awaited alert finish before asserting on it.
const flush = () => new Promise((resolve) => setImmediate(resolve))

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

  describe('MESSAGE reports', () => {
    const messageRow = {
      senderId: 'sender-1',
      conversation: { renterId: 'sender-1', ownerId: 'reporter-1' },
    }

    test('createReport throws NotFoundError when the message does not exist', async () => {
      const mockDb: any = { message: { findUnique: async () => null } }

      await assert.rejects(
        () => reportService.createReport('reporter-1', 'MESSAGE', 'missing', 'HARASSMENT', undefined, mockDb),
        (err: any) => {
          assert.strictEqual(err.statusCode, 404)
          assert.match(err.message, /message/i)
          return true
        }
      )
    })

    test('createReport throws ForbiddenError when the reporter is not in the conversation', async () => {
      const mockDb: any = { message: { findUnique: async () => messageRow } }

      await assert.rejects(
        () => reportService.createReport('outsider', 'MESSAGE', 'm-1', 'HARASSMENT', undefined, mockDb),
        (err: any) => {
          assert.strictEqual(err.statusCode, 403)
          return true
        }
      )
    })

    test('createReport throws BadRequestError when reporting your own message', async () => {
      const mockDb: any = { message: { findUnique: async () => messageRow } }

      await assert.rejects(
        () => reportService.createReport('sender-1', 'MESSAGE', 'm-1', 'SPAM', undefined, mockDb),
        (err: any) => {
          assert.strictEqual(err.statusCode, 400)
          assert.match(err.message, /own message/i)
          return true
        }
      )
    })

    test('createReport creates an OPEN report when a participant reports the other side', async () => {
      const mockDb: any = {
        message: { findUnique: async () => messageRow },
        report: { create: async (args: any) => ({ id: 'r-1', ...args.data }) },
      }

      const report = await reportService.createReport('reporter-1', 'MESSAGE', 'm-1', 'HARASSMENT', undefined, mockDb)

      assert.strictEqual(report.targetType, 'MESSAGE')
      assert.strictEqual(report.status, 'OPEN')
    })

    test('attachTargetLabels labels a message with its sender and truncated body', async () => {
      const longBody = 'x'.repeat(200)
      const mockDb: any = {
        message: {
          findMany: async () => [{ id: 'm-1', body: longBody, sender: { firstName: 'Sam', lastName: 'Lee' } }],
        },
      }

      const [labelled, missing] = await reportService.attachTargetLabels(
        [
          { targetType: 'MESSAGE', targetId: 'm-1' },
          { targetType: 'MESSAGE', targetId: 'gone' },
        ] as any,
        mockDb
      )

      assert.match(labelled.targetLabel, /^Sam Lee: "x+\.\.\."$/)
      assert.ok(labelled.targetLabel.length < 160)
      assert.strictEqual(missing.targetLabel, '[deleted message]')
    })
  })

  describe('support email', () => {
    test('a listing report emails support with the type, reporter, listing and ids', async () => {
      const mockDb: any = {
        listing: {
          findUnique: async (args: any) =>
            args.select?.owner ? { title: 'Canon EOS', owner: people['owner-1'] } : { id: 'l-1', ownerId: 'owner-1' },
        },
        user: { findUnique: async ({ where }: any) => people[where.id] ?? null },
        report: { create: async ({ data }: any) => createdReport(data) },
      }

      await reportService.createReport('reporter-1', 'LISTING', 'l-1', 'SCAM', 'Asks for e-transfer', mockDb)
      await flush()

      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].to, 'zoinksupport@gmail.com')
      assert.match(sent[0].subject, /listing, SCAM/)
      assert.match(sent[0].text, /"Canon EOS" \(listing l-1\), listed by Omar Ali <omar@mail\.utoronto\.ca>/)
      assert.match(sent[0].text, /Reporter: Ria Shah <ria@mail\.utoronto\.ca> \(user reporter-1\)/)
      assert.match(sent[0].text, /Details: Asks for e-transfer/)
      assert.match(sent[0].text, /Report report-1/)
    })

    test('a message report quotes the message and its sender', async () => {
      const mockDb: any = {
        message: {
          findUnique: async (args: any) =>
            args.select?.body
              ? { body: 'Pay me cash outside the app', conversationId: 'c-1', sender: people['owner-1'] }
              : { senderId: 'owner-1', conversation: { renterId: 'reporter-1', ownerId: 'owner-1' } },
        },
        user: { findUnique: async ({ where }: any) => people[where.id] ?? null },
        report: { create: async ({ data }: any) => createdReport(data) },
      }

      await reportService.createReport('reporter-1', 'MESSAGE', 'm-1', 'SCAM', undefined, mockDb)
      await flush()

      assert.match(sent[0].text, /message m-1 in conversation c-1, sent by Omar Ali/)
      assert.match(sent[0].text, /"Pay me cash outside the app"/)
      assert.match(sent[0].text, /Details: \(none\)/)
    })

    test('a failed send never fails the report', async () => {
      sendFails = true
      const warn = mock.method(console, 'warn', () => {})
      const mockDb: any = {
        user: { findUnique: async ({ where }: any) => people[where.id] ?? { id: where.id, firstName: 'X', lastName: 'Y', email: 'x@y' } },
        report: { create: async ({ data }: any) => createdReport(data) },
      }

      const report = await reportService.createReport('reporter-1', 'USER', 'owner-1', 'HARASSMENT', undefined, mockDb)
      await flush()

      assert.strictEqual(report.status, 'OPEN')
      assert.strictEqual(sent.length, 1)
      assert.ok(warn.mock.calls.some((c: any) => /Report alert email failed for report report-1/.test(String(c.arguments[0]))))
      warn.mock.restore()
    })
  })
})

