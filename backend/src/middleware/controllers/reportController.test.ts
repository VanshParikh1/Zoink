import { test, describe, beforeEach, mock } from 'node:test'
import assert from 'node:assert'
import { createReport } from './reportController'
import { createMockRequest, createMockResponse } from '../../testUtils/httpMocks'
import * as reportService from '../../services/reportService'
import { NotFoundError } from '../../utils/errors'
import { validate } from '../validate'
import { CreateReportSchema, ResolveReportSchema } from '../../schemas/report.schema'
import { errorHandler } from '../errorHandler'

describe('reportController', () => {
  let mockRes: any

  beforeEach(() => {
    mockRes = createMockResponse()
    mock.restoreAll()
  })

  test('createReport returns 201 with the created report', async () => {
    const mockReport = { id: 'r-1', status: 'OPEN' }
    mock.method(reportService, 'createReport', async () => mockReport)

    const req = createMockRequest({
      body: { targetType: 'LISTING', targetId: 'l-1', reason: 'SPAM', description: 'Fake listing.' },
      userId: 'reporter-1',
    })

    await createReport(req as any, mockRes as any, () => {})

    assert.strictEqual(mockRes.statusCode, 201)
    assert.deepStrictEqual(mockRes.body, mockReport)
  })

  test('createReport passes through NotFoundError for a missing target', async () => {
    mock.method(reportService, 'createReport', async () => {
      throw new NotFoundError('Reported listing not found')
    })

    const req = createMockRequest({
      body: { targetType: 'LISTING', targetId: 'missing', reason: 'SPAM' },
      userId: 'reporter-1',
    })

    let capturedError: any = null
    const next = (err?: any) => { capturedError = err }

    await createReport(req as any, mockRes as any, next)

    assert.ok(capturedError)
    assert.strictEqual(capturedError.statusCode, 404)
  })

  test('validate(CreateReportSchema) rejects a description under 10 characters', () => {
    const req: any = {
      body: {
        targetType: 'USER',
        targetId: '11111111-1111-4111-8111-111111111111',
        reason: 'HARASSMENT',
        description: 'Short',
      },
      params: {},
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(CreateReportSchema)(req, mockRes as any, next)

    assert.ok(capturedError, 'ZodError should be passed to next()')
    errorHandler(capturedError, req, mockRes as any, () => {})

    assert.strictEqual(mockRes.statusCode, 400)
    const paths = (mockRes.body as any).issues.map((i: any) => i.path)
    assert.ok(paths.includes('body.description'), 'should flag description under 10 characters')
  })

  test('validate(CreateReportSchema) accepts a report with no description', () => {
    const req: any = {
      body: {
        targetType: 'USER',
        targetId: '11111111-1111-4111-8111-111111111111',
        reason: 'HARASSMENT',
      },
      params: {},
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(CreateReportSchema)(req, mockRes as any, next)

    assert.ok(!capturedError, 'description is optional — should not raise a ZodError')
  })

  test('validate(CreateReportSchema) rejects an invalid targetType', () => {
    const req: any = {
      body: {
        targetType: 'BOOKING',
        targetId: '11111111-1111-4111-8111-111111111111',
        reason: 'SPAM',
      },
      params: {},
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(CreateReportSchema)(req, mockRes as any, next)

    assert.ok(capturedError, 'ZodError should be passed to next()')
  })

  test('validate(ResolveReportSchema) rejects a status other than REVIEWED/DISMISSED', () => {
    const req: any = {
      body: { status: 'OPEN' },
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(ResolveReportSchema)(req, mockRes as any, next)

    assert.ok(capturedError, 'OPEN is not a valid resolution status')
  })

  test('validate(ResolveReportSchema) accepts DISMISSED with optional adminNotes', () => {
    const req: any = {
      body: { status: 'DISMISSED', adminNotes: 'Not actionable.' },
      params: { id: '11111111-1111-4111-8111-111111111111' },
      query: {},
    }
    let capturedError: any = null
    const next = (err: any) => { capturedError = err }

    validate(ResolveReportSchema)(req, mockRes as any, next)

    assert.ok(!capturedError, 'should not raise a ZodError')
  })
})
