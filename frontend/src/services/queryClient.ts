import { AppState, Platform } from 'react-native'
import { focusManager, InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'

// One cache for every server read in the app (@tanstack/react-query). Screens
// show what's cached at once and refresh it behind the scenes
// (stale-while-revalidate), identical requests in flight are shared, and
// mutations update or invalidate exactly the entries they change.

// "Window focus" on a phone is the app coming back to the foreground: stale
// queries that are on screen refetch then.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => handleFocus(state === 'active'))
    return () => subscription.remove()
  })
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Fresh for 30 s: going back and forth between screens doesn't refetch;
      // after that, the cached data shows while it refreshes.
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // One quiet retry for a flaky network; a 4xx answer is final.
      retry: (failureCount, error: any) => failureCount < 1 && !(error?.response?.status >= 400 && error?.response?.status < 500),
    },
  },
})

/**
 * Pull-to-refresh on a paged list: keep only the first page and refetch it,
 * instead of re-requesting every page the user scrolled through.
 */
export async function refreshFirstPage(queryKey: QueryKey) {
  queryClient.setQueryData<InfiniteData<unknown, unknown>>(queryKey, (data) =>
    data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data
  )
  await queryClient.refetchQueries({ queryKey, exact: true })
}
