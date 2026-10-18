import api from './api'
import { Conversation, ConversationDetail, Message } from '../types'
import { DEMO_MODE } from '../config/demoMode'
// Demo-mode mocks load only in a dev build that sets EXPO_PUBLIC_DEMO_MODE to
// 'true'. That value is inlined at build time, so in every other build this
// condition folds to false and Metro drops the require — the mock modules and
// their data never reach the bundle. (Calls below sit behind DEMO_MODE, which
// uses the same check; see config/demoMode.ts.)
const {
  mockGetConversation,
  mockGetConversationMessages,
  mockGetMyConversations,
  mockMarkConversationRead,
  mockOpenConversation,
  mockSendMessage,
} = (__DEV__ && process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ? require('./mockWeek6') : {}) as typeof import('./mockWeek6')

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

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  if (DEMO_MODE) return mockGetConversation(conversationId)

  const res = await api.get(`/conversations/${conversationId}`)
  return res.data
}

export async function getConversationMessages(conversationId: string, after?: string): Promise<Message[]> {
  if (DEMO_MODE) return mockGetConversationMessages(conversationId, after)

  const res = await api.get(`/conversations/${conversationId}/messages`, {
    params: after ? { after } : undefined,
  })

  return res.data
}

export async function markConversationRead(conversationId: string): Promise<void> {
  if (DEMO_MODE) return mockMarkConversationRead(conversationId)

  await api.post(`/conversations/${conversationId}/read`)
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  if (DEMO_MODE) return mockSendMessage(conversationId, body)

  const res = await api.post(`/conversations/${conversationId}/messages`, { body })
  return res.data
}
