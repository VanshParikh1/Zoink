import test from 'node:test'
import assert from 'node:assert/strict'
import { validate } from '../validate'
import { CreateListingSchema, UpdateListingSchema, BrowseListingsQuerySchema } from '../../schemas/listing.schema'
import { createMockResponse } from '../../testUtils/httpMocks'
import { errorHandler } from '../errorHandler'

function runValidate(schema: any, body: Record<string, unknown> = {}, params: Record<string, unknown> = {}, query: Record<string, unknown> = {}) {
  const req: any = { body, params, query }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(schema)(req, res as any, next)

  return { req, res, capturedError }
}

function issuePaths(res: any) {
  return (res.body as any).issues.map((i: any) => i.path)
}

const validListingBody = {
  title: 'Sony a7III Camera',
  description: 'A great camera in excellent condition.',
  category: 'Electronics',
  dailyPrice: 25,
  city: 'Toronto',
  latitude: 43.65,
  longitude: -79.38,
}

test('validate(CreateListingSchema) accepts a well-formed listing', () => {
  const { capturedError } = runValidate(CreateListingSchema, validListingBody)
  assert.ok(!capturedError, 'should not raise a ZodError')
})

test('validate(CreateListingSchema) rejects title over 80 characters', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, title: 'T'.repeat(81) })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.title'))
})

test('validate(CreateListingSchema) rejects description over 1000 characters', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, description: 'D'.repeat(1001) })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.description'))
})

test('validate(CreateListingSchema) rejects category over 40 characters', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, category: 'C'.repeat(41) })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.category'))
})

test('validate(CreateListingSchema) rejects city over 60 characters', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, city: 'C'.repeat(61) })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.city'))
})

test('validate(CreateListingSchema) rejects address over 200 characters', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, address: 'A'.repeat(201) })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.address'))
})

test('validate(CreateListingSchema) rejects dailyPrice over 1000', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, dailyPrice: 1000.01 })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.dailyPrice'))
})

test('validate(CreateListingSchema) rejects itemValue over 10000', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, itemValue: 10000.01 })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.itemValue'))
})

test('validate(CreateListingSchema) rejects depositAmount over 5000', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, itemValue: 5000, depositAmount: 5000.01 })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.depositAmount'))
})

test('validate(CreateListingSchema) rejects depositAmount greater than itemValue', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, itemValue: 100, depositAmount: 150 })
  assert.ok(capturedError, 'depositAmount > itemValue should be rejected')
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.depositAmount'))
  assert.match((res.body as any).issues[0].message, /cannot exceed itemValue/)
})

test('validate(CreateListingSchema) accepts depositAmount equal to itemValue', () => {
  const { capturedError } = runValidate(CreateListingSchema, { ...validListingBody, itemValue: 100, depositAmount: 100 })
  assert.ok(!capturedError, 'depositAmount === itemValue should be accepted')
})

test('validate(CreateListingSchema) rejects depositAmount when itemValue is omitted', () => {
  const { capturedError, res } = runValidate(CreateListingSchema, { ...validListingBody, depositAmount: 4000 })
  assert.ok(capturedError, 'depositAmount without itemValue should be rejected — a deposit requires a declared item value')
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
})

test('validate(CreateListingSchema) accepts itemValue without depositAmount', () => {
  const { capturedError } = runValidate(CreateListingSchema, { ...validListingBody, itemValue: 500 })
  assert.ok(!capturedError, 'itemValue alone (no deposit) should be accepted — item value is independently optional')
})

test('validate(UpdateListingSchema) rejects depositAmount greater than itemValue', () => {
  const { capturedError, res } = runValidate(
    UpdateListingSchema,
    { itemValue: 100, depositAmount: 150 },
    { id: 'listing-1' }
  )
  assert.ok(capturedError, 'depositAmount > itemValue should be rejected on update too')
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('body.depositAmount'))
})

test('validate(BrowseListingsQuerySchema) rejects minPrice over 1000', () => {
  const { capturedError, res } = runValidate(BrowseListingsQuerySchema, {}, {}, { minPrice: '1000.01' })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('query.minPrice'))
})

test('validate(BrowseListingsQuerySchema) rejects maxPrice over 1000', () => {
  const { capturedError, res } = runValidate(BrowseListingsQuerySchema, {}, {}, { maxPrice: '1000.01' })
  assert.ok(capturedError)
  errorHandler(capturedError, {} as any, res as any, () => {})
  assert.equal(res.statusCode, 400)
  assert.ok(issuePaths(res).includes('query.maxPrice'))
})
