import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ConversationListPage } from '@zoink/shared'
import { getInboxPage } from '../services/conversationsApi'
import { queryKeys } from '../services/queryKeys'
import { Conversation } from '../types'
import { usePagedList } from '../hooks/usePagedList'
import { INBOX_POLL_MS } from '../config/polling'

export type ConversationsFeed = {
  conversations: Conversation[]
  /** Unread conversations across every page (the tab badge). */
  unreadCount: number
  loading: boolean
  /** Offline with nothing cached; loads when the connection returns. */
  offline: boolean
  error: unknown
  refreshing: boolean
  refresh: () => Promise<void>
  loadMore: () => void
  loadingMore: boolean
}

/**
 * The signed-in user's conversations, a page at a time: refreshed when
 * `active` becomes true (e.g. the screen regains focus) and polled every
 * INBOX_POLL_MS while it stays true and the app is in the foreground. Every
 * caller shares one cached feed.
 */
export function useConversationsFeed(active: boolean): ConversationsFeed {
  const queryClient = useQueryClient()
  const feed = usePagedList<Conversation, ConversationListPage>(queryKeys.inbox, getInboxPage, {
    refetchInterval: active ? INBOX_POLL_MS : false,
    refreshOnFocus: false,
  })

  // Coming back (e.g. a thread popped off) always rechecks: messages are the
  // one thing that can't wait for the cache to go stale.
  const activatedBefore = useRef(false)
  useEffect(() => {
    if (!active) return
    if (activatedBefore.current) queryClient.invalidateQueries({ queryKey: queryKeys.inbox })
    activatedBefore.current = true
  }, [active, queryClient])

  return useMemo(
    () => ({
      conversations: feed.items,
      unreadCount: feed.firstPage?.unreadCount ?? 0,
      loading: feed.loading,
      offline: feed.offline,
      error: feed.error,
      refreshing: feed.refreshing,
      refresh: feed.refresh,
      loadMore: feed.loadMore,
      loadingMore: feed.loadingMore,
    }),
    [feed.items, feed.firstPage, feed.loading, feed.offline, feed.error, feed.refreshing, feed.refresh, feed.loadMore, feed.loadingMore]
  )
}

// MainAppScreen owns one feed for both the Inbox tab's list and the unread dot
// on its tab icon.
const InboxContext = createContext<ConversationsFeed | null>(null)

export const InboxFeedProvider = InboxContext.Provider

/** The shared feed when rendered inside MainAppScreen, otherwise null. */
export function useSharedInboxFeed() {
  return useContext(InboxContext)
}
