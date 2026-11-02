import api from './api'
import { Conversation, ConversationDetail, Message } from '../types'
import type { ConversationListPage, MessageListItem } from '@zoink/shared'
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

/** One page of the inbox, newest conversation first, with the unread count for the tab badge. */
export async function getInboxPage(cursor?: string): Promise<ConversationListPage> {
  if (DEMO_MODE) {
    const items = await mockGetMyConversations()
    return { items, nextCursor: null, unreadCount: items.filter((conversation) => conversation.unread).length }
  }

  const res = await api.get('/conversations/me', { params: { limit: 20, cursor } })
  return res.data
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  if (DEMO_MODE) return mockGetConversation(conversationId)

  const res = await api.get(`/conversations/${conversationId}`)
  return res.data
}

export const MESSAGES_PAGE_SIZE = 50

/**
 * Messages, oldest first: the newest page when opening a thread, the ones
 * after `after` when polling, or the page before `before` when scrolling back.
 */
export async function getConversationMessages(
  conversationId: string,
  cursor: { after?: string; before?: string } = {}
): Promise<MessageListItem[]> {
  if (DEMO_MODE) return mockGetConversationMessages(conversationId, cursor.after)

  const res = await api.get(`/conversations/${conversationId}/messages`, {
    params: { limit: MESSAGES_PAGE_SIZE, after: cursor.after, before: cursor.before },
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
