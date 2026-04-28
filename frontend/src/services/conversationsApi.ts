import api from './api'
import { Conversation, Message } from '../types'
import { DEMO_MODE } from '../config/demoMode'
import {
  mockGetConversationMessages,
  mockGetMyConversations,
  mockOpenConversation,
  mockSendMessage,
} from './mockWeek6'

export async function openConversation(listingId: string): Promise<Conversation> {
  if (DEMO_MODE) return mockOpenConversation(listingId)

  const res = await api.post('/conversations', { listingId })
  return res.data
}

export async function getMyConversations(): Promise<Conversation[]> {
  if (DEMO_MODE) return mockGetMyConversations()

  const res = await api.get('/conversations/me')
  return res.data
}

export async function getConversationMessages(conversationId: string, after?: string): Promise<Message[]> {
  if (DEMO_MODE) return mockGetConversationMessages(conversationId, after)

  const res = await api.get(`/conversations/${conversationId}/messages`, {
    params: after ? { after } : undefined,
  })

  return res.data
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  if (DEMO_MODE) return mockSendMessage(conversationId, body)

  const res = await api.post(`/conversations/${conversationId}/messages`, { body })
  return res.data
}
