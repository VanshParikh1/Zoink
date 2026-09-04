import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as conversationService from '../../services/conversationService'
import {
  getConversationById,
  openConversation,
  sendMessage,
} from './conversationController'
import { createMockResponse } from '../../testUtils/httpMocks'
import { BadRequestError, ForbiddenError } from '../../utils/errors'
import { errorHandler } from '../errorHandler'
import { validate } from '../validate'
import { SendMessageSchema } from '../../schemas/conversation.schema'

function runValidate(params: Record<string, unknown>, body: Record<string, unknown>) {
  const req: any = { body, params, query: {} }
  const res = createMockResponse()
  let capturedError: any = null
  const next = (err: any) => { capturedError = err }

  validate(SendMessageSchema)(req, res as any, next)

  return { req, res, capturedError }
}

const validConversationId = '11111111-1111-4111-8111-111111111111'

test('validate(SendMessageSchema) accepts a well-formed message', () => {
  const { capturedError } = runValidate({ id: validConversationId }, { body: 'Hey, is this still available?' })
  assert.ok(!capturedError, 'should not raise a ZodError')
})

test('validate(SendMessageSchema) rejects a non-UUID conversation id', () => {
  const { capturedError, req, res } = runValidate({ id: 'not-a-uuid' }, { body: 'Hello' })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('params.id'), 'should flag a non-UUID conversation id')
})

test('validate(SendMessageSchema) rejects a message body over 2000 characters', () => {
  const { capturedError, req, res } = runValidate({ id: validConversationId }, { body: 'M'.repeat(2001) })

  assert.ok(capturedError, 'ZodError should be passed to next()')
  errorHandler(capturedError, req, res as any, () => {})

  assert.equal(res.statusCode, 400)
  const paths = (res.body as any).issues.map((i: any) => i.path)
  assert.ok(paths.includes('body.body'), 'should flag message body over 2000 characters')
})

const originalOpenConversation = conversationService.openConversation
const originalSendMessage = conversationService.sendMessage
const originalGetConversationById = conversationService.getConversationById

afterEach(() => {
  ;(conversationService as any).openConversation = originalOpenConversation
  ;(conversationService as any).sendMessage = originalSendMessage
  ;(conversationService as any).getConversationById = originalGetConversationById
})

test('getConversationById returns the conversation the service resolves', async () => {
  const fake = { id: 'conversation-1', listingId: 'listing-1', bookings: [] }
  ;(conversationService as any).getConversationById = async (userId: string, id: string) => {
    assert.equal(userId, 'user-1')
    assert.equal(id, 'conversation-1')
    return fake
  }

  const req: any = { userId: 'user-1', params: { id: 'conversation-1' } }
  const res = createMockResponse()

  await getConversationById(req, res as any, () => {})

  assert.deepEqual(res.body, fake)
})

test('getConversationById maps a non-participant to 403', async () => {
  ;(conversationService as any).getConversationById = async () => {
    throw new ForbiddenError('You do not have access to this conversation.')
  }

  const req: any = { userId: 'user-2', params: { id: 'conversation-1' } }
  const res = createMockResponse()
  let nextCalledWith: any = null
  const next = (err: any) => { nextCalledWith = err }

  await getConversationById(req, res as any, next)

  if (nextCalledWith) {
    errorHandler(nextCalledWith, req, res as any, () => {})
  }

  assert.equal(res.statusCode, 403)
})

test('openConversation returns 400 when listingId is missing', async () => {
  const req: any = {
    userId: 'user-1',
    body: {},
  }
  const res = createMockResponse()
  const next = (err: any) => {}

  await openConversation(req, res as any, next)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'listingId is required.' })
})

test('sendMessage returns 400 when body is missing', async () => {
  const req: any = {
    userId: 'user-1',
    params: { id: 'conversation-1' },
    body: {},
  }
  const res = createMockResponse()
  const next = (err: any) => {}

  await sendMessage(req, res as any, next)

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'body is required.' })
})

test('sendMessage maps MESSAGE_EMPTY errors to 400', async () => {
  ;(conversationService as any).sendMessage = async () => {
    throw new BadRequestError('Message body cannot be empty.')
  }

  const req: any = {
    userId: 'user-1',
    params: { id: 'conversation-1' },
    body: { body: '   ' },
  }
  const res = createMockResponse()
  let nextCalledWith: any = null
  const next = (err: any) => { nextCalledWith = err }

  await sendMessage(req, res as any, next)

  if (nextCalledWith) {
    errorHandler(nextCalledWith, req, res as any, () => {})
  }

  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { error: 'Message body cannot be empty.' })
})
