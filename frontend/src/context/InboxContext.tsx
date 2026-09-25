import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMyConversations } from '../services/conversationsApi'
import { Conversation } from '../types'
import { usePolling } from '../hooks/usePolling'
import { INBOX_POLL_MS } from '../config/polling'

export type ConversationsFeed = {
  conversations: Conversation[]
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

/**
 * The signed-in user's conversations: fetched when `active` becomes true (e.g.
 * the screen gains focus) and polled every INBOX_POLL_MS while it stays true
 * and the app is in the foreground.
 */
export function useConversationsFeed(active: boolean): ConversationsFeed {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setError('')
      setConversations(await getMyConversations())
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load your inbox.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (active) refresh()
  }, [active, refresh])

  usePolling(refresh, INBOX_POLL_MS, active)

  return useMemo(() => ({ conversations, loading, error, refresh }), [conversations, loading, error, refresh])
}

// MainAppScreen owns one feed for both the Inbox tab's list and the unread dot
// on its tab icon, instead of each polling the same endpoint separately.
const InboxContext = createContext<ConversationsFeed | null>(null)

export const InboxFeedProvider = InboxContext.Provider

/** The shared feed when rendered inside MainAppScreen, otherwise null. */
export function useSharedInboxFeed() {
  return useContext(InboxContext)
}
