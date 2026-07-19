import { Request, Response } from 'express'
import * as conversationService from '../../services/conversationService'
import { asyncHandler } from '../../utils/asyncHandler'

export const openConversation = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string
  const { listingId } = req.body

  if (!listingId) {
    return res.status(400).json({ error: 'listingId is required.' })
  }

  const conversation = await conversationService.openConversation(userId, listingId)
  return res.status(201).json(conversation)
})

export const getMyConversations = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string

  const conversations = await conversationService.getMyConversations(userId)
  return res.json(conversations)
})

export const getConversationMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string
  const conversationId = req.params.id as string
  const after = typeof req.query.after === 'string' ? req.query.after : undefined

  const messages = await conversationService.getConversationMessages(userId, conversationId, after)
  return res.json(messages)
})

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).userId as string
  const conversationId = req.params.id as string
  const { body } = req.body

  if (typeof body !== 'string') {
    return res.status(400).json({ error: 'body is required.' })
  }

  const message = await conversationService.sendMessage(userId, conversationId, body)
  return res.status(201).json(message)
})
