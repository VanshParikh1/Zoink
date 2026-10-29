import { useCallback, useMemo, useRef, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { QueryKey, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '@zoink/shared'
import { refreshFirstPage } from '../services/queryClient'

/**
 * Refetches the screen's queries when it comes back into focus (a pushed
 * screen popped off it), but only those that are stale or were invalidated
 * by a mutation meanwhile. Not on the first focus: mounting already fetched.
 */
export function useRefreshOnFocus(queryKey: QueryKey, enabled = true) {
  const queryClient = useQueryClient()
  const firstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false
        return
      }
      if (enabled) queryClient.refetchQueries({ queryKey, type: 'active', stale: true })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, enabled, JSON.stringify(queryKey)])
  )
}

type PagedListOptions = {
  enabled?: boolean
  /** Poll the loaded pages while this is set (e.g. the screen is focused). */
  refetchInterval?: number | false
  /** Refetch stale pages when the screen regains focus. The main tabs say
   *  false and use useTabLoad instead: they stay mounted behind each other. */
  refreshOnFocus?: boolean
}

/**
 * A cursor-paged list (see backend utils/pagination.ts): the pages loaded so
 * far as one array, `loadMore` for the list's onEndReached, and `refresh` for
 * pull-to-refresh, which goes back to the first page only.
 */
export function usePagedList<TItem extends { id: string }, TPage extends Page<TItem> = Page<TItem>>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | undefined) => Promise<TPage>,
  { enabled = true, refetchInterval = false, refreshOnFocus = true }: PagedListOptions = {}
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: TPage) => last.nextCursor ?? undefined,
    enabled,
    refetchInterval,
  })
  useRefreshOnFocus(queryKey, enabled && refreshOnFocus)

  // A row whose sort key changed between two page loads can appear on both;
  // keep its first appearance.
  const items = useMemo(() => {
    const seen = new Set<string>()
    const all: TItem[] = []
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        all.push(item)
      }
    }
    return all
  }, [query.data])

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const [refreshing, setRefreshing] = useState(false)
  const keyString = JSON.stringify(queryKey)
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshFirstPage(queryKey)
    } finally {
      setRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyString])

  return {
    items,
    firstPage: query.data?.pages[0],
    // isPaused, not fetchStatus: React Query re-renders for every result
    // field a component reads, and fetchStatus changes twice on every poll
    // (that re-rendered the tabs every 15 s); isPaused changes only offline.
    /** First load in flight (not while it waits for the connection: see `offline`). */
    loading: query.isPending && enabled && !query.isPaused,
    /** Offline with nothing cached: it loads by itself when the connection returns. */
    offline: query.isPending && enabled && query.isPaused,
    /** Null, or the failed load's error (utils/userMessage.ts turns it into words). */
    error: query.isError && items.length === 0 ? query.error : null,
    refreshing,
    refresh,
    loadMore,
    loadingMore: isFetchingNextPage,
    hasMore: Boolean(hasNextPage),
    retry: query.refetch,
  }
}
