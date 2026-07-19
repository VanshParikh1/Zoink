import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as conversationService from '../../services/conversationService'
import {
  openConversation,
  sendMessage,
} from './conversationController'
import { createMockResponse } from '../../testUtils/httpMocks'
import { BadRequestError } from '../../utils/errors'
import { errorHandler } from '../errorHandler'

const originalOpenConversation = conversationService.openConversation
const originalSendMessage = conversationService.sendMessage

afterEach(() => {
  ;(conversationService as any).openConversation = originalOpenConversation
  ;(conversationService as any).sendMessage = originalSendMessage
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
