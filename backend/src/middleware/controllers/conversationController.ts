import { Request, Response } from 'express'
import * as conversationService from '../../services/conversationService'

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR'
  const map: Record<string, { status: number; message: string }> = {
    LISTING_NOT_FOUND: { status: 404, message: 'Listing not found.' },
    CONVERSATION_NOT_FOUND: { status: 404, message: 'Conversation not found.' },
    CONVERSATION_FORBIDDEN: { status: 403, message: 'You do not have access to this conversation.' },
    CONVERSATION_SELF: { status: 400, message: 'You cannot open a conversation with your own listing.' },
    MESSAGE_EMPTY: { status: 400, message: 'Message body cannot be empty.' },
  }

  const mapped = map[message]
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message })
  }

  console.error('Unhandled conversation error:', error)
  return res.status(500).json({ error: 'Something went wrong.' })
}

export async function openConversation(req: Request, res: Response) {
  const userId = (req as any).userId as string
  const { listingId } = req.body

  if (!listingId) {
    return res.status(400).json({ error: 'listingId is required.' })
  }

  try {
    const conversation = await conversationService.openConversation(userId, listingId)
    return res.status(201).json(conversation)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function getMyConversations(req: Request, res: Response) {
  const userId = (req as any).userId as string

  try {
    const conversations = await conversationService.getMyConversations(userId)
    return res.json(conversations)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function getConversationMessages(req: Request, res: Response) {
  const userId = (req as any).userId as string
  const conversationId = req.params.id as string
  const after = typeof req.query.after === 'string' ? req.query.after : undefined

  try {
    const messages = await conversationService.getConversationMessages(userId, conversationId, after)
    return res.json(messages)
  } catch (error) {
    return handleError(res, error)
  }
}

export async function sendMessage(req: Request, res: Response) {
  const userId = (req as any).userId as string
  const conversationId = req.params.id as string
  const { body } = req.body

  if (typeof body !== 'string') {
    return res.status(400).json({ error: 'body is required.' })
  }

  try {
    const message = await conversationService.sendMessage(userId, conversationId, body)
    return res.status(201).json(message)
  } catch (error) {
    return handleError(res, error)
  }
}
